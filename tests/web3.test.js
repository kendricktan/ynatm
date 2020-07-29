const yatm = require("..");
const Web3 = require("web3");
const { BigNumber } = require("ethers");

const { abi, bytecode } = require("./contracts/StateMachine.json");
const { expectEqBN, expectGtBN, PROVIDER_URL } = require("./common");

const web3 = new Web3(PROVIDER_URL, null, { transactionConfirmationBlocks: 2 });

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
  const initialGasPrice = yatm.toGwei(1);

  const transaction = {
    from: signerAddress,
    to: signerAddress,
    data: "0x",
    nonce,
    gasLimit: 21000,
    gasPrice: initialGasPrice,
  };

  // Ignore if transaction fails
  web3.eth.sendTransaction(transaction).catch(() => {});

  // Send a bunch of transactions to override and overprice previous tx
  const { transactionHash } = await yatm(PROVIDER_URL).send({
    transaction,
    sendTransactionFunction: (tx) =>
      web3.eth.sendTransaction(tx, (err) => new Error(err)),
    minGasPrice: initialGasPrice + yatm.toGwei(1),
    maxGasPrice: yatm.toGwei(50),
    gasPriceScalingFunction: yatm.LINEAR(1),
    delay: 1000,
  });
  const { gasPrice } = await web3.eth.getTransaction(transactionHash);

  expectGtBN(BigNumber.from(gasPrice), BigNumber.from(initialGasPrice));
});

test("contract data override", async function () {
  const nonce = await web3.eth.getTransactionCount(signerAddress);

  const initialGasPrice = yatm.toGwei(1);
  const initialState = web3.utils.toWei("10");
  const initialData = StateMachine.methods.setState(initialState).encodeABI();

  const overrideState = web3.utils.toWei("100");
  const overrideData = StateMachine.methods.setState(overrideState).encodeABI();

  const initialTransaction = {
    from: signerAddress,
    to: StateMachine.options.address,
    data: initialData,
    nonce,
    gasLimit: 100000,
    gasPrice: initialGasPrice,
  };

  // Ignore if transaction fails
  web3.eth.sendTransaction(initialTransaction).catch(() => {});

  await yatm(PROVIDER_URL).send({
    transaction: { ...initialTransaction, data: overrideData },
    sendTransactionFunction: (tx) => web3.eth.sendTransaction(tx),
    minGasPrice: initialGasPrice + yatm.toGwei(1),
    maxGasPrice: yatm.toGwei(50),
    gasPriceScalingFunction: yatm.LINEAR(1),
    delay: 1000,
  });

  const finalState = await StateMachine.methods.state().call();
  expectEqBN(
    BigNumber.from(finalState),
    BigNumber.from(overrideState.toString())
  );
});
