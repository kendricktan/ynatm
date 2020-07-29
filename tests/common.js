const expectGtBN = (aBN, bBN) => {
  if (!aBN.gt(bBN)) {
    throw new Error(
      `Expected ${aBN.toString()} to be greater than ${bBN.toString()}`
    );
  }
};

const expectEqBN = (aBN, bBN) => {
  if (!aBN.eq(bBN)) {
    throw new Error(
      `Expected ${aBN.toString()} to be equal to ${bBN.toString()}`
    );
  }
};

const sleep = (ms) => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

module.exports = {
  PROVIDER_URL: "http://localhost:8545",
  expectEqBN,
  expectGtBN,
  sleep,
};
