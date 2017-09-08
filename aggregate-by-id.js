const R = require('ramda');
const S = require('sanctuary');
const assert = require('assert');

const data = [
  {id: 0, category: 'consumer',  capacity: 100, type: 'load', variation: 'defaultLoad'},
  {id: 1, category: 'generator', capacity: 100, type: 'variable', ramp: 0.1, variation: 'solar'},
  {id: 2, category: 'generator', capacity: 100, type: 'base', ramp: 0.1, base: 0.3},
  {id: 3, category: 'battery', type: 'battery'}
];

const powerData = {
  'defaultLoad':    [0.3, 0.7, 0.5, 0.3],
  'solar' :         [0.0, 0.2, 0.6, 0.0]
};

const expected = {
  date: "02:00",
  load: [{power: 70}],
  variable: [{power: 10, raw: 20}],
  base: [{power: 40}],
  battery: {
    buffer: 10,
    storage: -20
  }
};

function computeOutput (powerData, data) {

  const TYPES = ['load', 'variable', 'base', 'battery'];
  const DATES = [{date:"01:00"}, {date:"02:00"}, {date:"03:00"}, {date:"04:00"}];
  const hash = R.zipObj(
    TYPES,
    S.map(
      R.compose(
        S.flip(S.filter)(data),
        R.propEq('type')
      ), TYPES)
  );

  const getLoad = i => {
    return R.assoc('load',
      R.map(
        x => ({
          power: x.capacity * powerData[x.variation][i],
        }),
        hash.load
      )
    );
  };

  const checkRamp = (r, x) => R.compose(
    R.gte(r),
    R.compose(
      Math.abs,
      R.subtract(x)
    )
  );

  const computeRamp = (ramp, lastVal, x) => R.ifElse(
    checkRamp(ramp, lastVal),
    R.identity,
    R.clamp(
      R.subtract(lastVal, ramp),
      R.add(lastVal, ramp)
    )
  )(x);

  const variableObject = (gen, idx, i, last) => {
    return R.compose(
      p => ({
        raw: p,
        power: (R.isNil(last) || R.isEmpty(hash.battery)) ? p : computeRamp(gen.ramp * gen.capacity, last.variable[idx].power, p)
      }),
      R.always(gen.capacity * powerData[gen.variation][i])
    )(gen);
  };

  const getVariable = (i, last) => {
    return R.assoc('variable',
      R.addIndex(R.map)(
        (x, idx) => variableObject(x, idx, i, last),
        hash.variable
      )
    );
  };

  const getBuffer = R.chain(
    R.assocPath(['battery', 'buffer']),
    R.compose(
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

  const getStorage = R.chain(
    R.assocPath(['battery', 'storage']),
    R.compose(
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
        hash.base
      ),
      R.divide(R.__, hash.base.length),
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

  const f = (acc, val, i) => {
    return R.append(
      R.merge(R.compose(
        getStorage,
        getBase(R.last(acc)),
        getBuffer,
        getVariable(i, R.last(acc)),
        getLoad(i)
      )({}),
      val),
      acc
    );
  };

  return R.addIndex(R.reduce)(f, [], DATES);
}

const res = computeOutput(powerData, data);
assert.deepEqual(res[1], expected);
