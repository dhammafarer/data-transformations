const R = require('ramda');
const S = require('sanctuary');

const data = [
  {id: 0, category: 'consumer',  capacity: 100, type: 'load', variation: 'defaultLoad'},
  {id: 1, category: 'consumer',  capacity: 100, type: 'load', variation: 'defaultLoad'},
  {id: 2, category: 'generator', capacity: 100, type: 'variable', ramp: 0.1, variation: 'solar'},
  {id: 3, category: 'generator', capacity: 100, type: 'base', ramp: 0.1, base: 0.3},
  {id: 4, category: 'battery', type: 'battery'}
];

const TYPES = ['load', 'variable', 'base', 'battery'];
const DATES = [{date:"01:00"}, {date:"02:00"}, {date:"03:00"}, {date:"04:00"}];

const powerData = {
  'defaultLoad':    [0.3, 0.7, 0.5, 0.3],
  'solar' :         [0.0, 0.2, 0.6, 0.0]
};

const hash = R.zipObj(
  TYPES,
  S.map(
    R.compose(
      S.flip(S.filter)(data),
      R.propEq('type')
    ), TYPES)
);

function computeOutput () {
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

  const variableObject = (x, idx, i, last) => {
    return R.compose(
      p => ({
        power: p,
        control: R.isNil(last) ? 0 : computeRamp(10, last.variable[idx].control, p)
      }),
      R.always(x.capacity * powerData[x.variation][i])
    )(x);
  };

  const getVariable = (i, last) => {
    return R.assoc('variable',
      R.addIndex(R.map)(
        (x, idx) => variableObject(x, idx, i, last),
        hash.variable
      )
    );
  };

  const getBuffer = last => R.chain(
    R.merge,
    R.compose(
      R.objOf('battery'),
      //R.tap(console.log),
      R.ifElse(
        R.always(R.isNil(last)),
        R.map(R.always(0)),
        R.addIndex(R.map)(
          (x, i) => {
            console.log('last', last.variable[i].power);
            return computeRamp(10, last.variable[i].power, x.power);
          }
        )
      ),
      R.prop('variable')
    )
  );

  const getBase = last => R.chain(
    R.merge,
    R.compose(
      R.objOf('base'),
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
        getVariable(i, R.last(acc)),
        getLoad(i)
      )({}),
      val),
      acc
    );
  };

  return R.addIndex(R.reduce)(f, [], DATES);
}

console.log(R.pluck('variable', computeOutput()));
