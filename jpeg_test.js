const jpeg = require('jpeg-js');
const fs = require('fs');
const ProgTest = require("./progressive");
const _ = require("underscore");

function testImages() {
    let data = {};
    let namePaths = _.map(_.range(1, 13), number => {
        return "./data/images" + number + ".jpg";
    });
    _.each(namePaths, path => {
        let jpegData = fs.readFileSync(path);
        let rawImageData = jpeg.decode(jpegData);
        data[path] = rawImageData["data"];
    });
    let opts = {
        chart: "map",
        data: data,
        type: "dct"
    };
    let tester = new ProgTest.ProgTest(data, opts);
    let results = tester.qualityByRatio();
    console.log(results)
}
testImages();