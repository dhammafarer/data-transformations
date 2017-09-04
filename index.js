const R = require('ramda');

const data = [
  {id: 1, power: [
    {date: "00:05", value: 2},
    {date: "00:10", value: 3},
    {date: "00:15", value: 4},
    {date: "00:20", value: 5},
    {date: "00:25", value: 3},
    {date: "00:30", value: 2},
    {date: "00:35", value: 4},
    {date: "00:40", value: 5},
    {date: "00:45", value: 6},
    {date: "00:50", value: 8},
    {date: "00:55", value: 7},
    {date: "01:00", value: 4},
    {date: "01:05", value: 2},
    {date: "01:10", value: 3},
    {date: "01:15", value: 4},
    {date: "01:20", value: 5},
    {date: "01:25", value: 3},
    {date: "01:30", value: 2},
    {date: "01:35", value: 4},
    {date: "01:40", value: 5},
    {date: "01:45", value: 6},
    {date: "01:50", value: 8},
    {date: "01:55", value: 7},
    {date: "02:00", value: 4}
  ]},
  {id: 2, power: []}
];

const roundVal = R.compose(
  R.divide(R.__, 100),
  Math.round,
  R.multiply(100)
);

const merger = R.mergeWithKey((k,l,r) => k == 'value' ? R.mean([l,r]) : r);

let res = R.compose(
  R.map(R.compose(
    R.evolve({value: roundVal}),
    R.reduce(merger, {})
  )),
  R.splitEvery(6),
  R.path(['0', 'power'])
)(data);

console.log(res);
