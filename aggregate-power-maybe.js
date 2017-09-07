const R = require('ramda');
const S = require('sanctuary');
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
  {date: "01:00", pv:  0, load: 30,  pvControl:  0, base: 30, buffer:   0, storage:   0},
  {date: "02:00", pv: 20, load: 70,  pvControl: 10, base: 40, buffer:  10, storage: -20},
  {date: "03:00", pv: 60, load: 50,  pvControl: 20, base: 30, buffer:  40, storage:   0},
  {date: "04:00", pv:  0, load: 30,  pvControl: 10, base: 30, buffer: -10, storage:  10}
];

const dataNoBat= [
  {type: 'load', capacity: 100, variation: 'defaultLoad'},
  {type: 'pv', capacity: 100, ramp: 0.1, variation: 'pv'},
  {type: 'base', capacity: 100, ramp: 0.1, base: 0.3}
];

const expectedNoBat = [
  {date: "01:00", pv:  0, load: 30,  pvControl:  0, base: 30, buffer:  0, storage: 0},
  {date: "02:00", pv: 20, load: 70,  pvControl: 20, base: 40, buffer:  0, storage: 0},
  {date: "03:00", pv: 60, load: 50,  pvControl: 60, base: 30, buffer:  0, storage: 0},
  {date: "04:00", pv:  0, load: 30,  pvControl:  0, base: 30, buffer:  0, storage: 0}
];

const dataNoPV = [
  {type: 'load', capacity: 100, variation: 'defaultLoad'},
  {type: 'base', capacity: 100, ramp: 0.1, base: 0.3},
  {type: 'battery', capacity: 1000 },
];

const expectedNoPV = [
  {date: "01:00", pv:  0, load: 30,  pvControl:  0, base: 30, buffer:   0, storage:   0},
  {date: "02:00", pv:  0, load: 70,  pvControl:  0, base: 40, buffer:   0, storage: -30},
  {date: "03:00", pv:  0, load: 50,  pvControl:  0, base: 50, buffer:   0, storage:   0},
  {date: "04:00", pv:  0, load: 30,  pvControl:  0, base: 40, buffer:   0, storage:  10}
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
  const rawPower = (type, i) => S.fromMaybe(0, S.map(
    R.compose(
      ([c, v]) => R.multiply(c, powerData[v][i]),
      R.props(['capacity', 'variation'])
    ),
    data[type]
  ));

  const getLoad = i => R.assoc('load', rawPower('load', i));

  const getPV = i => R.assoc('pv', rawPower('pv', i));

  const checkRamp = (r, x) => R.compose(
    R.gte(r),
    R.compose(
      Math.abs,
      R.subtract(x)
    )
  );

  const computePVRamp = last => R.ifElse(
    checkRamp(PV_RAMP, last.pvControl),
    R.identity,
    R.clamp(
      R.subtract(last.pvControl, PV_RAMP),
      R.add(last.pvControl, PV_RAMP)
    )
  );

  const computeBaseRamp = last => R.ifElse(
    checkRamp(BASE_RAMP, last.base),
    R.identity,
    R.clamp(
      R.subtract(last.base, BASE_RAMP),
      R.add(last.base, BASE_RAMP)
    )
  );

  const setBaseRamp = last => R.ifElse(
    R.always(R.isNil(R.path(['base'], last))),
    R.identity,
    (x) => computeBaseRamp(last)(x)
  );

  const getPVcontrol = (last) => R.chain(
    R.merge,
    R.compose(
      R.objOf('pvControl'),
      R.ifElse(
        R.always(
          R.or(
            NO_BATT,
            R.isNil(R.path(['pvControl'], last))
          )
        ),
        R.identity,
        (x) => computePVRamp(last)(x)
      ),
      R.prop('pv')
    )
  );

  const getBase = last => R.chain(
    R.merge,
    R.compose(
      R.objOf('base'),
      setBaseRamp(last),
      R.ifElse(
        R.gt(BASE),
        R.always(BASE),
        R.identity
      ),
      R.reduceRight(R.subtract, 0),
      R.props(['load', 'pvControl'])
    )
  );

  const getBatteryBuffer = R.chain(
    R.merge,
    R.compose(
      R.objOf('buffer'),
      R.reduceRight(R.subtract, 0),
      R.props(['pv', 'pvControl'])
    )
  );

  const getBatteryStorage = R.chain(
    R.merge,
    R.compose(
      R.objOf('storage'),
      R.ifElse(
        R.always(NO_BATT),
        R.always(0),
        ([p, b, l]) => (p + b) - l
      ),
      R.props(['pvControl', 'base', 'load'])
    )
  );

  const f = (acc, val, i) => {
    return R.append(
      R.merge(R.compose(
        R.tap(console.log),
        getBatteryStorage,
        getBase(R.last(acc)),
        getBatteryBuffer,
        getPVcontrol(R.last(acc)),
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
//const resNoBat = computeOutput(powerData, dataNoBat);
//const resNoPV = computeOutput(powerData, dataNoPV);

assert.deepEqual(res, expected, '***BATTERY***');
//assert.deepEqual(resNoBat, expectedNoBat, '***NO BATTERY***');
//assert.deepEqual(resNoPV, expectedNoPV, '***NO PV***');
