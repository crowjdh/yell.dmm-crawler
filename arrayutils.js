exports.range = function (start, end, step = 1) {
  const len = Math.floor((end - start) / step) + 1
  return Array(len).fill().map((_, idx) => start + (idx * step))
}

exports.print = function (arr) {
	for (var i = 0; i < arr.length; i++) {
		console.log(arr[i]);
	}
}
