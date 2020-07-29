# Yet Another Transaction Manager

**(For Ethereum)**

With the recent spike in gas prices, you can't just send a 1 GWEI gas price for your Ethereum tx and hope that it will get mined.

This small module helps you guarantee that your transaction gets mined within a reasonable time frame, by bumping up the gas price (up till a threshold) until your transaction gets mined.

## Examples

### Ethers

```javascript
const ethers = require("ethers");
const yatm = require("yatm");

const provider = new ethers.providers.JsonRpcProvider(PROVIDER_URL);
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

const myERC20Token = new ethers.Contract(
  CONTRACT_ADDRESS,
  CONTRACT_ABI,
  wallet
)(async function () {
  // Min and Max GasPrice
  const minGasPrice = yatm.toGwei(30);
  const maxGasPrice = yatm.toGwei(100);

  // Increments by 2.5 GWEI between each try
  const gasPriceScalingFunction = yatm.LINEAR(2.5);

  /*
  // If you don't want to be in GWEI, you can specify it like so
  // Just make sure that the supplied slope is big enough that you
  // Don't end up with 1000 steps till it hits the maxGasPrice
  const gasPriceScalingFunction = yatm.LINEAR(2.5, false)

  // You can also specify alternative scaling functions, e.g.
  const gasPriceScalingFunction = yatm.EXPONENTIAL(2)
  */

  // Encode transaction data
  // If you just want to send ETH, data can be '0x'
  // e.g. const data = '0x'
  const data = myERC20Token.interface.encodeFunctionData("transfer", [
    RECIPIENT_ADDRESS,
    AMOUNT_IN_WEI,
  ]);

  // Transaction object
  // Make sure you specify the "to" address as the contract address
  const transaction = {
    from: wallet.address,
    to: CONTRACT_ADDRESS,
    data,
  };

  // Remote Provider URL can be any JSON-RPC URL
  // e.g. Infura, localhost:8545, etc
  const tx = await yatm(PROVIDER_URL).send({
    transaction,
    sendTransactionFunction: (tx) => wallet.sendTransaction(tx),
    minGasPrice,
    maxGasPrice,
    gasPriceScalingFunction,
    delay: 10000, // Delay between each retry. In ms.
  });
})();
```

### Web3

```javascript
const Web3 = require("web3");
const yatm = require("yatm");

const web3 = new Web3(PROVIDER_URL, null, { transactionConfirmationBlocks: 2 });

const myERC20Token = new web3.eth.Contract(CONTRACT_ADDRESS, CONTRACT_ABI)(
  async function () {
    // Min and Max GasPrice
    const minGasPrice = yatm.toGwei(30);
    const maxGasPrice = yatm.toGwei(100);

    // Increments by 2.5 GWEI between each try
    const gasPriceScalingFunction = yatm.LINEAR(2.5);

    /*
    // If you don't want to be in GWEI, you can specify it like so
    // Just make sure that the supplied slope is big enough that you
    // Don't end up with 1000 steps till it hits the maxGasPrice
    const gasPriceScalingFunction = yatm.LINEAR(2.5, false)

    // You can also specify alternative scaling functions, e.g.
    const gasPriceScalingFunction = yatm.EXPONENTIAL(2)
    */

    // Encode transaction data
    // If you just want to send ETH, data can be '0x'
    // e.g. const data = '0x'
    const data = StateMachine.methods
      .transfer(RECIPIENT_ADDRESS, AMOUNT_IN_WEI)
      .encodeABI();

    // Transaction object
    // Make sure you specify the "to" address as the contract address
    const transaction = {
      from: wallet.address,
      to: CONTRACT_ADDRESS,
      data,
    };

    // Remote Provider URL can be any JSON-RPC URL
    // e.g. Infura, localhost:8545, etc
    const tx = await yatm(PROVIDER_URL).send({
      transaction,
      sendTransactionFunction: (tx) => web3.eth.sendTransaction(tx),
      minGasPrice,
      maxGasPrice,
      gasPriceScalingFunction,
      delay: 10000, // Delay between each retry. In ms.
    });
  }
)();
```

## Testing

```bash
# Terminal 1
yes '' | geth --dev --dev.period 15 --http --http.addr "0.0.0.0" --http.port 8545 --http.api "eth,net,web3,account,admin,personal" --unlock "0" --allow-insecure-unlock

# Terminal 2
yarn test
```
