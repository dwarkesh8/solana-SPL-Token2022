# solana-SPL-Token2022
Creating new SPL v2 known as Token22 with Fee or Tax, Minting, Sending Token to Recipient, Withdrawal of Fees 

### Clone or Download this repository
```bash
git clone https://github.com/dwarkesh8/solana-SPL-Token2022.git
```

### Navigate to the cloned project directory
```bash
cd solana-SPL-Token2022
```

### Install dependencies
```bash
npm install
```

### Create data.json file in the project's root 
```bash
touch data.json
```

### Write empty '{}' into data.json file to avoid any runtime error  
```bash
echo "{}" > data.json
```

### Run the app.ts
```bash
ts-node app.ts
```

If everything goes well, you'll see output in your console, similar to the following given example output logs.

```bash
$ ts-node app.ts
New Token Created: https://explorer.solana.com/tx/4ZKQ2Jaa2pM6KAxCEW4zdC1vMQ28Pw6rjaTzTUJrrqTx79cgafddVsSZgJmf9t4bSwq3yaNaNdrVHP7YEzXQhCBF?cluster=devnet
Tokens Minted: https://explorer.solana.com/tx/3bNRhw9o9NAWjdn1J8QSXR21Rz4Kweb2ShzjyJ8q3zU6ooYNzpWTZKk9qXCD5EaWVeqpHZxJB3BDCc95Ksx1A7q?cluster=devnet
Tokens Transfered: https://explorer.solana.com/tx/5jeyDYz6HgWReo7Up56wXQViwYaDGp9WokhG8x1udvGUjsgumHQzdBBb1Y2XKmdxV623nXaVMm77MrCh6upSAem4?cluster=devnet
Withdraw from Accounts: https://explorer.solana.com/tx/34wCXtMTDz8Jtg1Ga3txukaA3PvdEegx6PBos16paNCooZFoGpxRycrqv94XLqEjKpmUhfNsbLrKarc4t48AvVtH?cluster=devnet
```