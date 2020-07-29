const Promise = require("bluebird");
const ethers = require("ethers");

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

const ynatm = (providerUrl) => {
  // Remote Provider
  const provider = new ethers.providers.JsonRpcProvider(providerUrl);

  /*
    Gradually keeps trying a transaction with an incremental amount of gas.
  */
  const send = async ({
    transaction,
    sendTransactionFunction,
    minGasPrice,
    maxGasPrice,
    gasPriceScalingFunction = LINEAR(1),
    delay = 60000,
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
      nonce = await provider.getTransactionCount(validatedTx.from);
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
        // Attempt to send the signed transaction after <x> delay
        const timeoutId = setTimeout(() => {
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

              if (failedTxs.length >= txs.length) {
                reject(e);
              }

              return;
            }
          };

          waitForTx();
        }, i * delay);

        timeoutIds.push(timeoutId);
      }
    });

    return promise;
  };

  return {
    send,
  };
};

// Default export and named exports
const myModule = ynatm;
myModule.EXPONENTIAL = EXPONENTIAL;
myModule.LINEAR = LINEAR;
myModule.toGwei = toGwei;

module.exports = myModule;
