# You Need A Transaction Manager (YNATM)

[![circleci](https://badgen.net/circleci/github/kendricktan/ynatm)](https://app.circleci.com/pipelines/github/kendricktan/ynatm)
[![npm](https://badgen.net/npm/v/ynatm)](https://www.npmjs.com/package/ynatm)

**(For Ethereum)**

With the recent spike in gas prices, you can't just send a 1 GWEI gas price for your Ethereum tx and hope that it will get mined.

This small module helps you guarantee that your transaction gets mined within a reasonable time frame, by bumping up the gas price (up till a threshold) until your transaction gets mined.

## Examples

### Quickstart

```bash
npm install ynatm
```

```javascript
const ynatm = require("ynatm");

const tx = await ynatm(PROVIDER_URL).send({
  transaction: {
    from: SENDER_ADDRESS,
    to: CONTRACT_ADDRESS,
    data: IContract.encodeFunctionData("functionName", [params]),
  },
  sendTransactionFunction: (tx) => wallet.sendTransaction(tx),
  minGasPrice: ynatm.toGwei(1),
  maxGasPrice: ynatm.toGwei(20),
  gasPriceScalingFunction: ynatm.LINEAR(5), // Scales by 5 GWEI in gasPrice between each try
  delay: 15000, // Waits 15 second between each try
});
```

### Ethers

```javascript
const ethers = require("ethers");
const ynatm = require("ynatm");

const provider = new ethers.providers.JsonRpcProvider(PROVIDER_URL);
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

const myERC20Token = new ethers.Contract(
  CONTRACT_ADDRESS,
  CONTRACT_ABI,
  wallet
)(async function () {
  // Min and Max GasPrice
  const minGasPrice = ynatm.toGwei(30);
  const maxGasPrice = ynatm.toGwei(100);

  // Increments by 2.5 GWEI between each try
  const gasPriceScalingFunction = ynatm.LINEAR(2.5);

  /*
  // If you don't want to be in GWEI, you can specify it like so
  // Just make sure that the supplied slope is big enough that you
  // Don't end up with 1000 steps till it hits the maxGasPrice
  const gasPriceScalingFunction = ynatm.LINEAR(2.5, false)

  // You can also specify alternative scaling functions, e.g.
  const gasPriceScalingFunction = ynatm.EXPONENTIAL(2)
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
  const tx = await ynatm(PROVIDER_URL).send({
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
const ynatm = require("ynatm");

const web3 = new Web3(PROVIDER_URL, null, { transactionConfirmationBlocks: 2 });

const myERC20Token = new web3.eth.Contract(CONTRACT_ADDRESS, CONTRACT_ABI)(
  async function () {
    // Min and Max GasPrice
    const minGasPrice = ynatm.toGwei(30);
    const maxGasPrice = ynatm.toGwei(100);

    // Increments by 2.5 GWEI between each try
    const gasPriceScalingFunction = ynatm.LINEAR(2.5);

    /*
    // If you don't want to be in GWEI, you can specify it like so
    // Just make sure that the supplied slope is big enough that you
    // Don't end up with 1000 steps till it hits the maxGasPrice
    const gasPriceScalingFunction = ynatm.LINEAR(2.5, false)

    // You can also specify alternative scaling functions, e.g.
    const gasPriceScalingFunction = ynatm.EXPONENTIAL(2)
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
    const tx = await ynatm(PROVIDER_URL).send({
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
yes '' | geth --dev --dev.period 15 --http --http.addr '0.0.0.0' --http.port 8545 --http.api 'eth,net,web3,account,admin,personal' --unlock '0' --allow-insecure-unlock

# Terminal 2
yarn test
```

If you don't have `geth` installed locally, you can also use `docker`

```bash
# Terminal 1
docker run -p 127.0.0.1:8545:8545/tcp --entrypoint /bin/sh ethereum/client-go -c "yes '' | geth --dev --dev.period 15 --http --http.addr '0.0.0.0' --http.port 8545 --http.api 'eth,net,web3,account,admin,personal' --unlock '0' --allow-insecure-unlock"

# Terminal 2
yarn test
```