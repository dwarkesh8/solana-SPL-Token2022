// Withdraw fees/tax from all fee holder accounts
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

// File where keys are saved
const DATA_FILE = 'data.json';

// Helper function to import keypair data from JSON
function importKeypair(name: string): Keypair {
    if (!fs.existsSync(DATA_FILE)) {
        throw new Error(`File ${DATA_FILE} does not exist.`);
    }

    const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
    const keypairData = data[name];

    if (!keypairData) {
        throw new Error(`Keypair for ${name} not found in ${DATA_FILE}.`);
    }

    return Keypair.fromSecretKey(Uint8Array.from(keypairData.secretKey));
}

// Initialize connection to local Solana node
const connection = new Connection('https://api.devnet.solana.com', 'confirmed');

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

// Define the amount to be transferred, accounting for decimals
const transferAmount = BigInt(100 * Math.pow(10, decimals)); // Transfer 100 tokens

// Calculate the fee for the transfer
const calcFee = (transferAmount * BigInt(feeBasisPoints)) / BigInt(10_000); // expect 10 fee
const fee = calcFee > maxFee ? maxFee : calcFee; // expect 9 fee

// Helper function to generate Explorer URL
function generateExplorerTxUrl(txId: string) {
    return `https://explorer.solana.com/tx/${txId}?cluster=devnet`;
}

async function main() {
    // Import existing keypairs
    const payer = importKeypair('payer');
    const mintAuthority = importKeypair('mintAuthority');
    const mintKeypair = importKeypair('mint');
    const owner = importKeypair('owner');
    const destinationOwner = importKeypair('destinationOwner');

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
    const feeVault = importKeypair('feeVault');
    const withdrawWithheldAuthority = importKeypair('withdrawWithheldAuthority');

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