const R = require('ramda');
const S = require('sanctuary');
const Just = S.Just;
const Nothing = S.Nothing;
const assert = require('assert');

const powerData = {
  'defaultLoad': [0.3, 0.7, 0.5, 0.3],
  'pv'         : [0.0, 0.2, 0.6, 0.0]
};

const data = [
  {type: 'load', capacity: 100, variation: 'defaultLoad'},
  {type: 'pv', capacity: 100, ramp: 0.1, variation: 'pv'},
  {type: 'base', capacity: 100, ramp: 0.1, base: 0.3},
  {type: 'battery', capacity: 1000 },
];

const expected = [
  {date: "01:00", pv:  Just(0), load: Just(30), pvControl: Just(0)},
  {date: "02:00", pv: Just(20), load: Just(70), pvControl: Just(10)},
  {date: "03:00", pv: Just(60), load: Just(50), pvControl: Just(20)},
  {date: "04:00", pv:  Just(0), load: Just(30), pvControl: Just(10)}
];

function computeOutput (powerData, xs) {
  // [String]
  const FIELDS = ['load', 'pv', 'base', 'battery'];

  // [Object] -> [Maybe Object]
  const encaseData = xs => R.zipObj(
    FIELDS,
    S.map(
      R.compose(
        S.flip(S.find)(xs),
        R.propEq('type')
      ), FIELDS)
  );

  // [Maybe Object]
  const data = encaseData(xs);
  const NO_BATT = false;

  // [Object]
  const DATES = [{date:"01:00"}, {date:"02:00"}, {date:"03:00"}, {date:"04:00"}];

  // Maybe Number
  const PV_RAMP = S.map(S.product, S.map(R.props(['capacity', 'ramp']), data.pv));

  // Maybe Number
  const BASE_RAMP = S.map(S.product, S.map(R.props(['capacity', 'ramp']), data.base));

  // Maybe Number
  const BASE = S.map(S.product, S.map(R.props(['capacity', 'base']), data.base));

  // String -> Number -> Maybe Number
  const rawPower = (type, i) => S .map(
    R.compose(
      ([c, v]) => R.multiply(c, powerData[v][i]),
      R.props(['capacity', 'variation'])
    ),
    data[type]
  );

  const getLoad = i => R.assoc('load', rawPower('load', i));

  const getPV = i => R.assoc('pv', rawPower('pv', i));

  const checkRamp = (r, x) => R.compose(
    R.gte(r),
    R.compose(
      Math.abs,
      R.subtract(x)
    )
  );

  // Integer -> Integer -> Integer -> Integer
  const computePVRamp = ramp => lastVal => x => R.ifElse(
    checkRamp(ramp, lastVal),
    R.identity,
    R.clamp(
      R.subtract(lastVal, ramp),
      R.add(lastVal, ramp)
    )
  )(x);

  // Maybe Object -> Object -> Maybe Integer
  const getPVcontrol = last => R.chain(
    R.merge,
    R.compose(
      R.objOf('pvControl'),
      R.ifElse(
        R.always(S.isNothing(last)),
        R.identity,
        (x) => S.lift3(
          computePVRamp,
          PV_RAMP,
          R.chain(R.prop('pvControl'), last),
          x)
      ),
      R.prop('pv')
    )
  );

  const f = (acc, val, i) => {
    return R.append(
      R.merge(R.compose(
        R.tap(console.log),
        getPVcontrol(S.last(acc)),
        getPV(i),
        getLoad(i)
      )({}),
      val),
      acc
    );
  };

  return R.addIndex(R.reduce)(f, [], DATES);
}

const res = computeOutput(powerData, data);

assert.deepEqual(res, expected, '***BATTERY***');
