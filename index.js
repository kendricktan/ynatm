const Promise = require("bluebird");

// GWEI = 1e9
const GWEI = Math.pow(10, 9);
const MAX_INT32 = ~(1 << 31)

const toGwei = (x) => x * GWEI;

const EXPONENTIAL = (base = 2, inGwei = true) => ({ x }) => {
  let p = Math.pow(base, x);
  if (inGwei) {
    p = toGwei(p);
  }
  return x + p;
};

const LINEAR = (slope = 1, inGwei = true) => ({ x, c }) => {
  let p = slope * x;
  if (inGwei) {
    p = toGwei(p);
  }
  return c + p;
};

const DOUBLES = ({ y }) => {
  return y * 2;
};

// The default behaviour of an overflow of the timeout value
// passed to `setTimeout` will result it being set to 1.
const sanitizeTimeout = (timeout) => {
  if (timeout > MAX_INT32) {
    console.log(
      `WARNING: Timeout larger than max supported timeout size.
                    ${timeout} set to ${MAX_INT32}.
          `
    );
    return MAX_INT32;
  }
  return timeout;
}

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
    curGasPrice = gasPriceScalingFunction({
      y: curGasPrice,
      x: ++i,
      c: minGasPrice,
    });
  }

  return gasPrices;
};

// Immediately rejects the promise if it contains the "revert" keyword
const rejectOnRevert = (e) => {
  return e.toString().toLowerCase().includes("revert");
};

/**
 * Gradually keeps trying a transaction with an incremental amount of gas
 * while keeping the same nonce.
 *
 * @param {Function} sendTransactionFunction:
 *   Function that accepts a gasPrice, and uses that gasPrice to send another tx
 *   e.g. (gasPrice) => wallet.sendTranscation({ ...tx, gasPrice })
 *        (gasPrice) => web3.eth.sendTransaction(tx, { from: sender, gasPrice })
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
  sendTransactionFunction,
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

  // List of varying gasPrices
  const gasPrices = getGasPriceVariations({
    minGasPrice,
    maxGasPrice,
    gasPriceScalingFunction,
  });

  const promise = new Promise((resolve, reject) => {
    // List of timeout Ids
    let timeoutIds = [];
    let failedTxs = [];

    // After waiting (N + 1) * delay seconds, throw an error
    const finalTimeoutId = setTimeout(() => {
      reject(new Error("Transaction taking too long!"));
    }, sanitizeTimeout((gasPrices.length + 1) * delay));
    timeoutIds.push(finalTimeoutId);

    // For each signed transactions
    for (const [i, gasPrice] of gasPrices.entries()) {
      // Async function to wait for transaction
      const waitForTx = async () => {
        try {
          const tx = await sendTransactionFunction(gasPrice);

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
            failedTxs.length >= gasPrices.length ||
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
      const timeoutId = setTimeout(waitForTx, sanitizeTimeout(i * delay));
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
  DOUBLES,
};
