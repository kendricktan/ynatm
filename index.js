const Promise = require("bluebird");

// GWEI = 1e9
const GWEI = Math.pow(10, 9);

const toGwei = (x) => x * GWEI;

const EXPONENTIAL = (base = 2, inGwei = true) => (x, tries = 0) => {
  let p = Math.pow(base, tries);
  if (inGwei) {
    p = toGwei(p);
  }
  return x + p;
};

const LINEAR = (slope = 1, inGwei = true) => (x, tries = 0) => {
  let p = slope * tries;
  if (inGwei) {
    p = toGwei(p);
  }
  return x + p;
};

// Returns a list of gasPrices, based on the scaling function
const getGasPriceVariations = ({
  minGasPrice,
  maxGasPrice,
  gasPriceScalingFunction,
}) => {
  // Calculates a sequence of gasPrices
  let i = 0;
  let curGasPrice = minGasPrice;
  let gasPrices = [];

  // Warning for the user on their gasPrice if their first
  // Increment is < 1e-6 (because of the GWEI conversion)
  const firstGasPriceDelta =
    gasPriceScalingFunction(minGasPrice, 1) - minGasPrice;
  if (firstGasPriceDelta / minGasPrice < 1e-6) {
    console.log(
      `WARNING: GasPrice is scaling very slowly. Might take a while.
                Double check the supplied gasPriceScalingFunction.
                If you're using a custom function, make sure to use toGwei.
      `
    );
  }

  for (;;) {
    if (curGasPrice > maxGasPrice) break;
    gasPrices = gasPrices.concat(curGasPrice);
    curGasPrice = gasPriceScalingFunction(minGasPrice, ++i);
  }

  return gasPrices;
};

// Validates the "transaction" object
const validateTransaction = (tx) => {
  let hasError = false;
  let errors = {};

  if (!tx.from) {
    errors.from = "Missing `from` address";
    hasError = true;
  }

  if (!tx.to) {
    errors.to = "Missing `to` address";
    hasError = true;
  }

  if (hasError) {
    throw new Error(`Invalid transaction object: ${JSON.stringify(errors)}`);
  }

  return tx;
};

// Immediately rejects the promise if it contains the "revert" keyword
const rejectOnRevert = (e) => {
  return e.toString().toLowerCase().includes("revert");
};

/**
 * Gradually keeps trying a transaction with an incremental amount of gas
 * while keeping the same nonce.
 *
 * @param {Object} transaction:
 *   Object that should be passed to your supplied sendTransactionFunction.
 *   e.g. { from: address, to: address, gas: 21000, data: '0x' }
 * @param {Function} getTransactionNonceFunction:
 *   Function that returns a Promise that resolves to the latest nonce.
 *   Not needed if transaction.nonce is supplied
 *   e.g. () => provider.getTransactionCount(sender)
 *        () => web3.eth.getTransactionCount(sender)
 * @param {Function} sendTransactionFunction:
 *   Function that accepts a transaction object, sends it and returns a Promise that resolves to tx receipt
 *   e.g. (tx) => wallet.sendTranscation(tx)
 *        (tx) => web3.eth.sendTransaction(tx, {from: sender})
 * @param {number} minGasPrice:
 *   Minimum gasPrice to start with
 * @param {number} masGasPrice:
 *   Maximum allowed gasPrice
 * @param {number} delay:
 *   Delay before retrying transaction with a higher gasPrice (ms)
 * @param {Function} rejectImmediatelyOnCondition:
 *   If an error occurs and matches some condition. Throws the error immediately
 *   and stops attempting to retry the proceeding transactions.
 *   By default, it'll stop immediately stop if the error contains the string "revert"
 */
const send = async ({
  transaction,
  sendTransactionFunction,
  getTransactionNonceFunction,
  minGasPrice,
  maxGasPrice,
  gasPriceScalingFunction = LINEAR(5),
  delay = 60000,
  rejectImmediatelyOnCondition = rejectOnRevert,
}) => {
  // Make sure its an int
  minGasPrice = parseInt(minGasPrice);

  // Defaults to 2x minGasPrice
  if (!maxGasPrice) {
    maxGasPrice = 2 * minGasPrice;
  } else {
    maxGasPrice = parseInt(maxGasPrice);
  }

  // Validated transaction
  const validatedTx = validateTransaction(transaction);

  // Get nonce
  let nonce = transaction.nonce;
  if (nonce === undefined || nonce === null) {
    if (!getTransactionNonceFunction) {
      throw new Error(
        "transaction.nonce and getTransactionNonceFunction is empty! Please supply at least one of the parameters."
      );
    }

    nonce = await getTransactionNonceFunction();
  }

  // List of varying gasPrices
  const gasPrices = getGasPriceVariations({
    minGasPrice,
    maxGasPrice,
    gasPriceScalingFunction,
  });

  const txs = gasPrices.map((gasPrice) => {
    return {
      ...validatedTx,
      nonce,
      gasPrice,
    };
  });

  const promise = new Promise((resolve, reject) => {
    // List of timeout Ids
    let timeoutIds = [];
    let failedTxs = [];

    // After waiting (N + 1) * delay seconds, throw an error
    const finalTimeoutId = setTimeout(() => {
      reject(new Error("Transaction taking too long!"));
    }, (txs.length + 1) * delay);
    timeoutIds.push(finalTimeoutId);

    // For each signed transactions
    for (const [i, txData] of txs.entries()) {
      // Async function to wait for transaction
      const waitForTx = async () => {
        try {
          const tx = await sendTransactionFunction(txData);

          // Clear other timeouts
          for (const tid of timeoutIds) {
            clearTimeout(tid);
          }

          resolve(tx);
        } catch (e) {
          failedTxs.push(e);

          // Reject if either we have retried all possible gasPrices
          // Or if some condition is met
          if (
            failedTxs.length >= txs.length ||
            rejectImmediatelyOnCondition(e)
          ) {
            for (const tid of timeoutIds) {
              clearTimeout(tid);
            }
            reject(e);
          }
        }
      };

      // Attempt to send the signed transaction after <x> delay
      const timeoutId = setTimeout(waitForTx, i * delay);
      timeoutIds.push(timeoutId);
    }
  });

  return promise;
};

module.exports = {
  send,
  toGwei,
  EXPONENTIAL,
  LINEAR,
};
