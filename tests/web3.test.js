const ynatm = require("..");
const Web3 = require("web3");
const { BigNumber } = require("ethers");

const { abi, bytecode } = require("./contracts/StateMachine.json");
const { expectEqBN, expectGtBN, PROVIDER_URL } = require("./common");

const web3 = new Web3(PROVIDER_URL, null, { transactionConfirmationBlocks: 1 });

let StateMachine;
let signerAddress;

beforeAll(async function () {
  const accounts = await web3.eth.getAccounts();

  // Gets signer address
  signerAddress = accounts[0];

  // Deploys the token contract and gets related interface
  const Factory = new web3.eth.Contract(abi);
  StateMachine = await Factory.deploy({
    from: signerAddress,
    data: `0x${bytecode}`,
  }).send({ from: signerAddress });
});

test("simple override", async function () {
  const nonce = await web3.eth.getTransactionCount(signerAddress);
  const initialGasPrice = ynatm.toGwei(1);

  const transaction = {
    from: signerAddress,
    to: signerAddress,
    data: "0x",
    nonce,
    gas: 21000,
    gasPrice: initialGasPrice,
  };

  // Ignore if transaction fails
  web3.eth.sendTransaction(transaction).catch(() => {});

  // Send a bunch of transactions to override and overprice previous tx
  const { transactionHash } = await ynatm.send({
    transaction,
    sendTransactionFunction: (tx) =>
      web3.eth.sendTransaction(tx, (err) => new Error(err)),
    minGasPrice: initialGasPrice + ynatm.toGwei(1),
    maxGasPrice: ynatm.toGwei(50),
    gasPriceScalingFunction: ynatm.LINEAR(1),
    delay: 1000,
  });
  const { gasPrice } = await web3.eth.getTransaction(transactionHash);

  expectGtBN(BigNumber.from(gasPrice), BigNumber.from(initialGasPrice));
});

test("contract data override", async function () {
  const nonce = await web3.eth.getTransactionCount(signerAddress);

  const initialGasPrice = ynatm.toGwei(1);
  const initialState = web3.utils.toWei("10");

  const overrideState = web3.utils.toWei("100");

  const options = {
    from: signerAddress,
    nonce,
    gas: 100000,
    gasPrice: initialGasPrice,
  };

  // Ignore if transaction fails
  StateMachine.methods
    .setState(initialState)
    .send(options)
    .catch(() => {});

  await ynatm.send({
    transaction: options,
    sendTransactionFunction: (txOptions) =>
      StateMachine.methods.setState(overrideState).send(txOptions),
    minGasPrice: initialGasPrice + ynatm.toGwei(1),
    maxGasPrice: ynatm.toGwei(50),
    gasPriceScalingFunction: ynatm.LINEAR(1),
    delay: 1000,
  });

  const finalState = await StateMachine.methods.state().call();
  expectEqBN(
    BigNumber.from(finalState),
    BigNumber.from(overrideState.toString())
  );
});
