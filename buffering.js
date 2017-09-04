const R = require('ramda');

const data = [1,4,1,5,3,4,5,6,1];

const f = (acc, val) => {
  const l = R.last(acc);
  let res = [];
  if (val - l[0] < -1) res = [l[0] - 1, l[1] + (val - l[0] - 1)];
  if (val - l[0] > 1) res = [l[0] + 1, l[1] + (val - l[0] - 1)];
  if (Math.abs(val - l[0]) <= 1) res = [val, l[1]];

  acc = R.append(res, acc);
  return acc;
};

let res = R.reduce(f, [[0,0]], data);

console.log(res);
