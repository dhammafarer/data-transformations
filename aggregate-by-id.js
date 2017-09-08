const R = require('ramda');
const S = require('sanctuary');
const assert = require('assert');

const data = [
  {id: 0, category: 'consumer',  capacity: 100, type: 'load', variation: 'defaultLoad'},
  {id: 1, category: 'generator', capacity: 100, type: 'variable', ramp: 0.1, variation: 'solar'},
  {id: 2, category: 'generator', capacity: 100, type: 'base', ramp: 0.1, base: 0.3},
  {id: 3, category: 'battery', type: 'battery', buffer: true, storage: true}
];

const expected = [
  { date: "01:00", load: [{power: 30}], variable: [{power: 00, raw:  0}], base: [{power: 30}], battery: [{buffer:   0, storage:   0 }] },
  { date: "02:00", load: [{power: 70}], variable: [{power: 10, raw: 20}], base: [{power: 40}], battery: [{buffer:  10, storage: -20 }] },
  { date: "03:00", load: [{power: 50}], variable: [{power: 20, raw: 60}], base: [{power: 30}], battery: [{buffer:  40, storage:   0 }] },
  { date: "04:00", load: [{power: 30}], variable: [{power: 10, raw:  0}], base: [{power: 30}], battery: [{buffer: -10, storage:  10 }] }
];

const powerData = {
  'defaultLoad':    [0.3, 0.7, 0.5, 0.3],
  'solar' :         [0.0, 0.2, 0.6, 0.0]
};

// Object -> [a] -> [b]
function computeOutput (powerData, data) {

  // [String]
  const TYPES = ['load', 'variable', 'base', 'battery'];

  // [Object]
  const DATES = [{date: "01:00"}, {date: "02:00"}, {date: "03:00"}, {date: "04:00"}];

  // Object
  const HASH = R.zipObj(
    TYPES,
    R.map(
      R.compose(
        R.flip(S.filter)(data),
        R.propEq('type')
      ),
      TYPES)
  );

  // (a -> b -> c -> d) -> [e]
  const f = (acc, val, i) => R.append(
    R.merge(
      R.compose(
        getStorage,
        getBase(R.last(acc)),
        getBuffer,
        getVariable(i, R.last(acc)),
        getLoad(i)
      )({}),
      val
    ),
    acc
  );

  // Integer -> (a -> b)
  const getLoad = i => {
    return R.assoc('load',
      R.map(
        x => ({power: x.capacity * powerData[x.variation][i]}),
        HASH.load
      )
    );
  };

  // Num -> Num -> (Num -> Bool)
  const checkRamp = (r, x) => R.compose(
    R.gte(r),
    R.compose(
      Math.abs,
      R.subtract(x)
    )
  );

  // Num -> Num -> Num -> Num
  const computeRamp = (ramp, lastVal, x) => R.ifElse(
    checkRamp(ramp, lastVal),
    R.identity,
    R.clamp(
      R.subtract(lastVal, ramp),
      R.add(lastVal, ramp)
    )
  )(x);

  // a -> Integer -> Integer -> b -> c
  const variableObject = (gen, idx, i, last) => {
    return R.compose(
      p => ({
        raw: p,
        power: (R.isNil(last) || R.isEmpty(R.filter(R.prop('buffer'), HASH.battery))) ? p : computeRamp(gen.ramp * gen.capacity, last.variable[idx].power, p)
      }),
      R.always(gen.capacity * powerData[gen.variation][i])
    )(gen);
  };

  // Integer -> a -> (b -> c)
  const getVariable = (i, last) => {
    return R.assoc('variable',
      R.addIndex(R.map)(
        (x, idx) => variableObject(x, idx, i, last),
        HASH.variable
      )
    );
  };

  // a -> b
  const getBuffer = R.chain(
    R.assoc('battery'),
    R.compose(
      load => R.map(
        R.compose(
          R.objOf('buffer'),
          R.ifElse(
            R.prop('buffer'),
            R.always(load),
            R.always(0)
          )
        ), HASH.battery
      ),
      R.sum,
      R.map(
        R.compose(
          R.reduceRight(R.subtract, 0),
          R.values
        )
      ),
      R.prop('variable')
    )
  );

  // a -> b
  const getStorage = R.chain(
    R.evolve,
    R.compose(
      x => ({battery: R.zipWith(R.merge, x)}),
      load => R.map(
        R.compose(
          R.objOf('storage'),
          R.ifElse(
            R.prop('storage'),
            R.always(load),
            R.always(0)
          )
        ),
        HASH.battery
      ),
      ([v, b, l]) => (v + b) - l,
      R.map(
        R.compose(
          R.sum,
          R.pluck('power')
        )
      ),
      R.props(['variable', 'base', 'load'])
    )
  );

  // a -> b -> c
  const getBase = last => R.chain(
    R.assoc('base'),
    R.compose(
      load => R.addIndex(R.map)(
        (gen, idx) => R.compose(
          R.objOf('power'),
          R.ifElse(
            R.always(R.isNil(last)),
            R.identity,
            x => computeRamp(gen.ramp * gen.capacity, last.base[idx].power, x)
          ),
          R.ifElse(
            R.lt(load),
            R.identity,
            R.always(load)
          ),
          R.always(gen.base * gen.capacity)
        )(load),
        HASH.base
      ),
      R.divide(R.__, HASH.base.length),
      R.reduceRight(R.subtract, 0),
      R.map(
        R.compose(
          R.sum,
          R.pluck('power')
        )
      ),
      R.props(['load', 'variable'])
    )
  );

  return R.addIndex(R.reduce)(f, [], DATES);
}

const res = computeOutput(powerData, data);

assert.deepEqual(res, expected);
