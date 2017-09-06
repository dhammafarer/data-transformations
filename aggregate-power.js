const R = require('ramda');

const dates = [{date:"01"}, {date:"02"}, {date:"03"}, {date:"04"}];

const data = [
  {type: 'load', capacity: 100, variation: [0.3, 0.4, 0.5, 0.3]},
  {type: 'pv', capacity: 100, ramp: 0.1, variation: [0.0, 0.2, 0.6, 0.0]},
  {type: 'base', capacity: 100, ramp: 0.1, base: 0.3},
  {type: 'battery', capacity: 1000 },
];

const empty = [];
const vc = (idx, i) => data[idx].variation[i] * data[idx].capacity;
const getLoad = i => R.assoc('load', vc(0,i))
const getPV = i => R.assoc('pv', vc(1,i))
const getBase = R.chain(
  R.merge,
  R.compose(
    R.objOf('base'),
    R.ifElse(R.gt(0), R.always(0), R.identity),
    R.reduceRight(R.subtract, 0),
    R.props(['load', 'pv'])
  )
);

const f = (acc, val, i) => {
  return R.append(
    R.merge(R.compose(
      getBase,
      getPV(i),
      getLoad(i)
    )({})
    , val),
    acc
  );
};

let res = R.addIndex(R.reduce)(f, empty, dates);

console.log(res);
