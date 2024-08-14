// All the operations in one single file
import {
    sendAndConfirmTransaction,
    Connection,
    Keypair,
    SystemProgram,
    Transaction,
    LAMPORTS_PER_SOL,
    PublicKey,
} from '@solana/web3.js';

import {
    ExtensionType,
    createInitializeMintInstruction,
    mintTo,
    createAccount,
    getMintLen,
    getTransferFeeAmount,
    unpackAccount,
    TOKEN_2022_PROGRAM_ID,
    createInitializeTransferFeeConfigInstruction,
    harvestWithheldTokensToMint,
    transferCheckedWithFee,
    withdrawWithheldTokensFromAccounts,
    withdrawWithheldTokensFromMint,
    getOrCreateAssociatedTokenAccount,
    createAssociatedTokenAccountIdempotent
} from '@solana/spl-token';

import * as fs from 'fs';

// Initialize connection to local Solana node
const connection = new Connection('https://api.devnet.solana.com', 'confirmed');

// File where keys will be saved
const DATA_FILE = 'data.json';

// Helper function to save keypair data
function saveKeypair(name: string, keypair: Keypair) {
    const keypairData = {
        publicKey: keypair.publicKey.toBase58(),
        secretKey: Array.from(keypair.secretKey),
    };

    let data: { [key: string]: any } = {};
    if (fs.existsSync(DATA_FILE)) {
        const rawData = fs.readFileSync(DATA_FILE, 'utf-8');
        data = JSON.parse(rawData);
    }

    data[name] = keypairData;
    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// Generate and save keypairs
const payer = Keypair.generate();
saveKeypair('payer', payer);

const mintAuthority = Keypair.generate();
saveKeypair('mintAuthority', mintAuthority);

const mintKeypair = Keypair.generate();
saveKeypair('mint', mintKeypair);

const transferFeeConfigAuthority = Keypair.generate();
saveKeypair('transferFeeConfigAuthority', transferFeeConfigAuthority);

const withdrawWithheldAuthority = Keypair.generate();
saveKeypair('withdrawWithheldAuthority', withdrawWithheldAuthority);

// Define the extensions to be used by the mint
const extensions = [
    ExtensionType.TransferFeeConfig,
];

// Calculate the length of the mint
const mintLen = getMintLen(extensions);

// Set the decimals, fee basis points, and maximum fee
const decimals = 9;
const feeBasisPoints = 100; // 1%
const maxFee = BigInt(9 * Math.pow(10, decimals)); // 9 tokens, max chargable fees

// Define the amount to be minted and the amount to be transferred, accounting for decimals
const mintAmount = BigInt(1_000_000 * Math.pow(10, decimals)); // Mint 1,000,000 tokens
const transferAmount = BigInt(1_000 * Math.pow(10, decimals)); // Transfer 1,000 tokens

// Calculate the fee for the transfer
const calcFee = (transferAmount * BigInt(feeBasisPoints)) / BigInt(10_000); // expect 10 fee
const fee = calcFee > maxFee ? maxFee : calcFee; // expect 9 fee

// Helper function to generate Explorer URL
function generateExplorerTxUrl(txId: string) {
    return `https://explorer.solana.com/tx/${txId}?cluster=devnet`;
}

async function main() {
    // Step 1 - Airdrop to Payer
    const airdropSignature = await connection.requestAirdrop(payer.publicKey, 2 * LAMPORTS_PER_SOL);
    await connection.confirmTransaction({ signature: airdropSignature, ...(await connection.getLatestBlockhash()) });

    // Step 2 - Create a New Token
    const mintLamports = await connection.getMinimumBalanceForRentExemption(mintLen);
    const mintTransaction = new Transaction().add(
        SystemProgram.createAccount({
            fromPubkey: payer.publicKey,
            newAccountPubkey: mintKeypair.publicKey,
            space: mintLen,
            lamports: mintLamports,
            programId: TOKEN_2022_PROGRAM_ID,
        }),
        createInitializeTransferFeeConfigInstruction(
            mintKeypair.publicKey,
            transferFeeConfigAuthority.publicKey,
            withdrawWithheldAuthority.publicKey,
            feeBasisPoints,
            maxFee,
            TOKEN_2022_PROGRAM_ID
        ),
        createInitializeMintInstruction(mintKeypair.publicKey, decimals, mintAuthority.publicKey, null, TOKEN_2022_PROGRAM_ID)
    );
    const newTokenTx = await sendAndConfirmTransaction(connection, mintTransaction, [payer, mintKeypair], undefined);
    console.log("New Token Created:", generateExplorerTxUrl(newTokenTx));

    // Step 3 - Mint tokens to Owner
    const owner = Keypair.generate();
    saveKeypair('owner', owner);

    const sourceAccount = await createAssociatedTokenAccountIdempotent(connection, payer, mintKeypair.publicKey, owner.publicKey, {}, TOKEN_2022_PROGRAM_ID);
    const mintSig = await mintTo(connection, payer, mintKeypair.publicKey, sourceAccount, mintAuthority, mintAmount, [], undefined, TOKEN_2022_PROGRAM_ID);
    console.log("Tokens Minted:", generateExplorerTxUrl(mintSig));

    // Step 4 - Send Tokens from Owner to a New Account
    const destinationOwner = Keypair.generate();
    saveKeypair('destinationOwner', destinationOwner);

    const destinationAccount = await createAssociatedTokenAccountIdempotent(connection, payer, mintKeypair.publicKey, destinationOwner.publicKey, {}, TOKEN_2022_PROGRAM_ID);
    const transferSig = await transferCheckedWithFee(
        connection,
        payer,
        sourceAccount,
        mintKeypair.publicKey,
        destinationAccount,
        owner,
        transferAmount,
        decimals,
        fee,
        []
    );
    console.log("Tokens Transfered:", generateExplorerTxUrl(transferSig));

    // Step 5 - Fetch Fee Accounts
    const allAccounts = await connection.getProgramAccounts(TOKEN_2022_PROGRAM_ID, {
        commitment: 'confirmed',
        filters: [
            {
                memcmp: {
                    offset: 0,
                    bytes: mintKeypair.publicKey.toString(),
                },
            },
        ],
    });

    const accountsToWithdrawFrom: PublicKey[] = [];
    for (const accountInfo of allAccounts) {
        const account = unpackAccount(accountInfo.pubkey, accountInfo.account, TOKEN_2022_PROGRAM_ID);
        const transferFeeAmount = getTransferFeeAmount(account);
        if (transferFeeAmount !== null && transferFeeAmount.withheldAmount > BigInt(0)) {
            accountsToWithdrawFrom.push(accountInfo.pubkey);
        }
    }

    // Step 6 Withdraw Fees by Authority
    const feeVault = Keypair.generate();
    saveKeypair('feeVault', feeVault);

    const feeVaultAccount = await createAssociatedTokenAccountIdempotent(connection, payer, mintKeypair.publicKey, feeVault.publicKey, {}, TOKEN_2022_PROGRAM_ID);

    const withdrawSig1 = await withdrawWithheldTokensFromAccounts(
        connection,
        payer,
        mintKeypair.publicKey,
        feeVaultAccount,
        withdrawWithheldAuthority,
        [],
        accountsToWithdrawFrom
    );
    console.log("Withdraw from Accounts:", generateExplorerTxUrl(withdrawSig1));
}

main();
