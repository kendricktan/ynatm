const ynatm = require("..");
const ethers = require("ethers");

const { expectGtBN, expectEqBN, PROVIDER_URL } = require("./common");
const { abi, bytecode } = require("./contracts/StateMachine.json");

const provider = new ethers.providers.JsonRpcProvider(PROVIDER_URL);
const signer = provider.getSigner();

let signerAddress;
let StateMachine;

beforeAll(async function () {
  // Gets signer address
  signerAddress = await signer.getAddress();

  // Deploys the token contract and gets related interface
  const Factory = new ethers.ContractFactory(abi, bytecode, signer);
  StateMachine = await Factory.deploy();
  const { transactionHash } = await StateMachine.deployTransaction.wait();

  // Waits for 2 confirmations
  await provider.waitForTransaction(transactionHash, 1, 120000);
});

test("simple override", async function () {
  const nonce = await provider.getTransactionCount(signerAddress);
  const initialGasPrice = ynatm.toGwei(1);

  const transaction = {
    from: signerAddress,
    to: signerAddress,
    data: "0x",
    nonce,
    gasLimit: 21000,
    gasPrice: initialGasPrice,
  };

  // Ignore if transaction fails
  signer.sendTransaction(transaction).catch(() => {});

  // Send a bunch of transactions to override and overprice previous tx
  const tx = await ynatm.send({
    sendTransactionFunction: (gasPrice) =>
      signer.sendTransaction({ ...transaction, gasPrice }),
    minGasPrice: initialGasPrice + ynatm.toGwei(1),
    maxGasPrice: ynatm.toGwei(50),
    gasPriceScalingFunction: ynatm.LINEAR(1),
    delay: 1000,
  });
  const { transactionHash } = await tx.wait();

  await provider.waitForTransaction(transactionHash, 1, 120000);

  const { gasPrice } = await provider.getTransaction(transactionHash);

  // Make sure the final gasPrice is > minGasPrice
  expectGtBN(gasPrice, ethers.BigNumber.from(initialGasPrice));
});

test("contract data override", async function () {
  const nonce = await provider.getTransactionCount(signerAddress);

  const initialGasPrice = ynatm.toGwei(1);
  const initialState = ethers.utils.parseEther("10");
  const overrideState = ethers.utils.parseEther("100");

  const options = {
    from: signerAddress,
    nonce,
    gasLimit: 100000,
    gasPrice: initialGasPrice,
  };

  // Ignore if transaction fails
  StateMachine.setState(initialState, options).catch(() => {});

  const tx = await ynatm.send({
    sendTransactionFunction: (gasPrice) =>
      StateMachine.setState(overrideState, { ...options, gasPrice }),
    minGasPrice: initialGasPrice + ynatm.toGwei(1),
    maxGasPrice: ynatm.toGwei(50),
    gasPriceScalingFunction: ynatm.LINEAR(1),
    delay: 1000,
  });
  const { transactionHash } = await tx.wait();

  await provider.waitForTransaction(transactionHash, 1, 120000);

  const finalState = await StateMachine.state();
  expectEqBN(finalState, overrideState);
});

test(`does not retry on revert`, async function () {
  const nonce = await provider.getTransactionCount(signerAddress);
  const transaction = {
    from: signerAddress,
    to: ethers.constants.AddressZero,
    nonce,
    data: "0x1111111111111111",
    value: ethers.utils.parseEther("1"),
    gasLimit: 100000,
  };

  expect(
    ynatm.send({
      sendTransactionFunction: (gasPrice) =>
        signer.sendTransaction({ ...transaction, gasPrice }),
      minGasPrice: ynatm.toGwei(1),
      maxGasPrice: ynatm.toGwei(2),
      gasPriceScalingFunction: ynatm.LINEAR(1),
      delay: 120000,
    })
  ).rejects.toThrow("revert");
});

test(`throws on all errors`, async function () {
  // Make sure this isn't the first tx as its using nonce of 0
  const transaction = {
    from: signerAddress,
    to: signerAddress,
    nonce: 0,
    value: ethers.utils.parseEther("1"),
    gasLimit: 100000,
  };

  expect(
    ynatm.send({
      transaction,
      sendTransactionFunction: (gasPrice) =>
        signer.sendTransaction({ ...transaction, gasPrice }),
      minGasPrice: ynatm.toGwei(1),
      maxGasPrice: ynatm.toGwei(2),
      gasPriceScalingFunction: ynatm.LINEAR(1),
      delay: 120000,
      rejectImmediatelyOnCondition: () => true,
    })
  ).rejects.toThrow("nonce");
});
