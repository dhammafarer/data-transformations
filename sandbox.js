const R = require('ramda');

const res = R.chain(
  R.evolve,
  R.compose(
    x => ({battery: R.zipWith(R.merge, x)}),
    R.always([{storage: 0}])
  )
)({battery: [{buffer: 1}]})

console.log(res.battery);
