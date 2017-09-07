const R = require('ramda');
const assert = require('assert');

const data = [
  {type: 'load', capacity: 100, variation: [0.3, 0.4, 0.5, 0.3]},
  {type: 'pv', capacity: 100, ramp: 0.1, variation: [0.0, 0.2, 0.6, 0.0]},
  {type: 'base', capacity: 100, ramp: 0.1, base: 0.3},
  {type: 'battery', capacity: 1000 },
];

const dates = [{date:"01"}, {date:"02"}, {date:"03"}, {date:"04"}];

const expected = [
  {date:"01", pv:  0, pvControl:  0, load: 30, base: 30},
  {date:"02", pv: 20, pvControl: 10, load: 40, base: 30},
  {date:"03", pv: 60, pvControl: 20, load: 50, base: 30},
  {date:"04", pv:  0, pvControl: 10, load: 30, base: 20}
];

const vc = (idx, i) => data[idx].variation[i] * data[idx].capacity;

const getLoad = i => R.assoc('load', vc(0,i));

const getPV = i => R.assoc('pv', vc(1,i));

const checkRamp = (r,x) => R.compose(R.gte(r), R.compose(Math.abs, R.subtract(x)));

const computeRamp = last => R.ifElse(
  checkRamp(10, last.pvControl),
  R.identity,
  R.clamp(R.subtract(last.pvControl, 10), R.add(last.pvControl, 10))
);

const getPVcontrol = (last) => R.chain(
  R.merge,
  R.compose(
    R.objOf('pvControl'),
    R.ifElse(
      R.always(R.isNil(R.path(['pvControl'], last))),
      R.identity,
      (x) => computeRamp(last)(x)
    ),
    R.prop('pv')
  )
);

const getBase = R.chain(
  R.merge,
  R.compose(
    R.objOf('base'),
    R.ifElse(R.gt(0), R.always(0), R.identity),
    R.reduceRight(R.subtract, 0),
    R.props(['load', 'pvControl'])
  )
);

const f = (acc, val, i) => {
  return R.append(
    R.merge(R.compose(
      getBase,
      getPVcontrol(R.last(acc)),
      getPV(i),
      getLoad(i)
    )({}),
    val),
    acc
  );
};

let res = R.addIndex(R.reduce)(f, [], dates);
console.log(res);

assert.deepEqual(res, expected);
