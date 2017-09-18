const _ = require("underscore");
var ProgTest = (function ProgTest() {
    function ProgTest(data, opts) {
        this.data = opts["data"] || null;
        this.qualityResults = {};
        this.ratio = [1];
        this.type = opts["type"];
        this.chart = opts["chart"];
        if (this.chart === "simple") {
            _.each(data, element => {
                if (element["Latitude"] !== "" && element["Longitude"] !== "") {
                    if (element["State"] in this.data) {
                        this.data[element["State"]].push([parseFloat(element["Latitude"]), parseFloat(element["Longitude"])]);
                    }
                    else {
                        this.data[element["State"]] = [[parseFloat(element["Latitude"]), parseFloat(element["Longitude"])]];
                    }
                }
            });
        }
        else if (this.chart === "barchart") {
            if (!this.data) {
                this.data = {};
                let barsData = {}
                const parameters = {a: 50, b:50, c:30}
                _.each(parameters, (value, key) => {
                    for (let i = 0; i < value; i++) {
                        const keyData = key + ":" + i;
                        console.log("clean:" + keyData);
                        let results = _.filter(data, function(dict){ return parseInt(dict[key]) === i; });
                        let data_list = [];
                        let keys = _.filter(Object.keys(parameters), x => {return x !== key; });
                        for (let m = 0; m < parameters[keys[0]]; m++) {
                            for (let n = 0; n < parameters[keys[1]]; n++) {
                                let specificResults = _.filter(results, function(dict){ return parseInt(dict[keys[0]]) === m && parseInt(dict[keys[1]]) === n; });
                                const average = _.reduce(specificResults, (mem, element) => {return mem + parseInt(element["d"])}, 0) / specificResults.length;
                                data_list.push(average);
                            }
                        }
                        barsData[key] = data_list;
                    }
                });
                this.data = barsData;
            }
        }
        else if (this.chart === "map" && this.type === "dct") {
            let subImage = [];
            const stride = 8 * 8;
            _.each(data, (image, key) => {
                for(let i = 0; i < image.length; i = i + stride) {
                    let l = [];
                    for (let j = 0; j < stride; j++) {
                        l.push(image[i + j]);
                    }
                    subImage.push(l);
                }
                this.data[key] = subImage;
            });
        }
    }

    ProgTest.prototype.qualityByRatio = function() {
        let qualityResults = {};
        _.each(this.ratio, r => {
            console.log("test ratio:", r);
            const quality = this.testQuality(r);
            qualityResults[r + ""] = quality;
        });

        return this.getDistanceAccuracy(qualityResults);
    }

    ProgTest.prototype.testQuality = function(ratio) {

        let testResult = null;
        if (this.type === "dct") {
            testResult = this.testDCTEncoding(this.data, ratio);
        }
        else {
            testResult = this.testsamplingEncoding(this.data, ratio);
        }

        return this.getAverageResults(testResult);
    }

    ProgTest.prototype.getDistanceAccuracy = function(result) {
        const max = result["0.01"];
        const min = 0;
        let retDict ={};
        retDict["0"] = 0;
        _.each(result, (distance, ratio) => {
            if (parseFloat(ratio) > 0.02) {
                retDict[ratio] = 1 - distance / max;
            }
        });
        return retDict;
    }

    ProgTest.prototype.testsamplingEncoding = function(data, ratio) {
        let testResult = {};
        if (this.chart === "simple") {
            _.each(this.data, (locations, state) => {
                const number = Math.floor(locations.length * ratio);
                let sampling = _.sample(locations, number);
                const latLow = _.max(sampling, location => { return location[0]; })[0] || 0;
                const latHigh = _.max(sampling, location => { return -1 * location[0]; })[0] || 0;
                const lonLow = _.max(sampling, location => { return location[1]; })[1] || 0;
                const lonHigh = _.max(sampling, location => { return -1 * location[1]; })[1] || 0;
                // for (let i = number; i < locations.length; i++) {
                // 	// const randomLat = Math.random() * (latHigh - latLow) + latLow;
                // 	// const randomLon = Math.random() * (lonHigh - lonLow) + lonLow;
                // 	// sampling.push([randomLat, randomLon]);
                // 	sampling.push([lonLow, latLow]);
                // }
                const centerLat = _.reduce(locations, (mem, location) => {return mem + location[0]}, 0) / locations.length;
                const centerLon = _.reduce(locations, (mem, location) => {return mem + location[1]}, 0) / locations.length;
                const sampleLat = _.reduce(sampling, (mem, location) => {return mem + location[0]}, 0) / sampling.length || 0;
                const sampleLon = _.reduce(sampling, (mem, location) => {return mem + location[1]}, 0) / sampling.length || 0;
                console.log(state, ratio, centerLat, centerLon, sampleLat, sampleLon, sampling)
                const distance = Math.sqrt(Math.pow((sampleLat - centerLat), 2) + Math.pow((sampleLon - centerLon), 2));
                testResult[state] = distance;
            });
        }
        else if(this.chart === "barchart") {
            _.each(this.data, (list, key) => {
                const number = Math.floor(list.length * ratio);
                let sampling = list.slice(0, number) || [];

                let heightLow = _.max(sampling, height => { return height; })|| 0;
                let heightHigh = _.max(sampling, height => { return -1 * height; }) || 0;

                if (sampling.length === 0) {
                    heightLow = 0;
                    heightHigh = 0;
                }
                for (let i = number; i < list.length; i++) {
                    const randomLat = Math.random() * (heightHigh - heightLow) + heightLow;
                    sampling.push(randomLat);
                }

                let distance = 0;
                _.each(sampling, (height, idx) => {
                    distance = distance + Math.abs(height - list[idx]);
                });
                console.log(ratio, "distance:", distance / list.length)
                testResult[key] = distance / list.length;
            });
        }
        else if(this.chart === "map") {
            _.each(this.data, (encodeing, key) => {
                const number = Math.floor(encodeing.length * ratio);
                let shuffle = _.shuffle(_.range(0, encodeing.length)).slice(0, number) || [];
                let indexes = _.sortBy(shuffle, (num) => { return num; });
                let index = 0;
                let add = 0;
                let completeSampling = [];
                for(let i = 0; i < encodeing.length; i++) {
                    if (i === indexes[index]) {
                        add = encodeing[i];
                        index++;
                    }
                    completeSampling.push(add);
                }
                let distance = 0;
                _.each(completeSampling, (height, idx) => {
                    distance = distance + Math.abs(height - encodeing[idx]);
                });
                // console.log(ratio, "distance:", distance / completeSampling.length);
                testResult[key] = distance / completeSampling.length;
            })
        }
        return testResult;
    };

    ProgTest.prototype.testDCTEncoding = function(data, ratio) {
        let testResult = {};
        if (this.chart === "simple") {
            _.each(this.data, (locations, state) => {
                let lat_list = [];
                let lon_list = [];
                _.each(locations, location => {
                    lat_list.push(location[0]);
                    lon_list.push(location[1]);
                });
                let encodedlat_list = this.DCTEncoding(lat_list);
                let encodedlon_list = this.DCTEncoding(lon_list);
                const number = Math.floor(encodedlat_list.length * ratio);
                encodedlat_list = encodedlat_list.slice(0, number);
                encodedlon_list = encodedlon_list.slice(0, number);
                let dct = [];
                for (let i = number; i < lat_list.length; i++) {
                    encodedlat_list.push(0);
                    encodedlon_list.push(0);
                }
                let decodedlat_list = this.DCTDecoding(encodedlat_list);
                let decodedlon_list = this.DCTDecoding(encodedlon_list);

                for (let i = 0; i < decodedlat_list.length; i++) {
                    dct.push([decodedlat_list[i], decodedlon_list[i]]);
                }
                const centerLat = _.reduce(locations, (mem, location) => {return mem + location[0]}, 0) / locations.length;
                const centerLon = _.reduce(locations, (mem, location) => {return mem + location[1]}, 0) / locations.length;
                const dctLat = _.reduce(dct, (mem, location) => {return mem + location[0]}, 0) / dct.length;
                const dctLon = _.reduce(dct, (mem, location) => {return mem + location[1]}, 0) / dct.length;
                const distance = Math.sqrt(Math.pow((dctLat - centerLat), 2) + Math.pow((dctLon - centerLon), 2));
                testResult[state] = distance;

            });
        }
        else if(this.chart === "barchart") {
            _.each(this.data, (list, key) => {
                let encoded_list = this.DCTEncoding(list);
                const number = Math.floor(list.length * ratio);
                let en_list = encoded_list.slice(0, number);

                for (let i = number; i < encoded_list.length; i++) {
                    en_list.push(0);
                }
                let decoded_list = this.DCTDecoding(en_list);

                let distance = 0;
                _.each(decoded_list, (height, idx) => {
                    distance = distance + Math.abs(height - list[idx]);
                });
                console.log(ratio, "distance:", distance / list.length);
                testResult[key] = distance / list.length;
            });
        }
        else if(this.chart === "map") {
            _.each(this.data, (subImages, map) => {
                let decoded_list = [];
                let origin = [];
                _.each(subImages, (encoding, idx) => {
                    console.log(map, idx);
                    let encoded_list = this.DCTEncoding(encoding);
                    const number = Math.floor(encoding.length * ratio);
                    let sampling = _.sample(encoded_list, number) || [];

                    for(let i = number; i < encoding.length; i++) {
                        sampling.push(0);
                    }
                    decoded_list =  decoded_list.concat(this.DCTDecoding(sampling));
                    let en = [];
                    for(let i = 0; i < encoding.length; i++) {
                        en.push(encoding[i]);
                    }
                    origin = origin.concat(en);
                });

                let distance = 0;
                _.each(decoded_list, (height, idx) => {
                    distance = distance + Math.abs(height - origin[idx]);
                });
                console.log(ratio, "distance:", distance / decoded_list.length);
                testResult[map] = distance / decoded_list.length;
            })
        }
        return testResult;
    }

    ProgTest.prototype.DCTEncoding = function(data) {
        const quantization = [
            16, 11, 10, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55, 14, 13, 16, 24, 40, 57, 69, 56,
            14, 17, 22, 29, 51, 87, 80, 62, 18, 22, 37, 56, 68, 109, 103, 77, 24, 35, 55, 64, 81, 104, 113, 92,
            49, 64, 78, 87, 103, 121, 120, 101, 72, 92, 95, 98, 112, 100, 103, 99];
        let encoded_list = [];
        const N = data.length;
        for (let k = 0; k < N; k++) {
            let c = 0;
            for (let n = 0; n < N; n++) {
                c += data[n] * Math.cos((Math.PI / N) * k * (n + 0.5) )
            }
            encoded_list.push(c)
        }
        //quantization
        const encodeN = encoded_list.length;
        const M = quantization.length;
        for (let i = 0; i < encodeN; i++) {
            encoded_list[i] = Math.floor(encoded_list[i] / quantization[i % M]);
        }
        return encoded_list;
    }

    ProgTest.prototype.DCTDecoding = function(data) {
        const quantization = [
            16, 11, 10, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55, 14, 13, 16, 24, 40, 57, 69, 56,
            14, 17, 22, 29, 51, 87, 80, 62, 18, 22, 37, 56, 68, 109, 103, 77, 24, 35, 55, 64, 81, 104, 113, 92,
            49, 64, 78, 87, 103, 121, 120, 101, 72, 92, 95, 98, 112, 100, 103, 99];
        const tempBytes = [];
        for (let i = 0; i < data.length; i++) {
            tempBytes.push(data[i]);
        }

        //decode data using DCT
        for(let index in tempBytes) {
            tempBytes[index] = tempBytes[index] * quantization[index % quantization.length];
        }
        const N = tempBytes.length;
        let decoded_list = [];
        for(let index = 0; index < N; index++) {
            let c = 0;
            for(let n = 1; n < N; n++) {
                c = c + tempBytes[n] * Math.cos((Math.PI / N) * n * (index + 0.5) )
            }
            c = c + 0.5 * tempBytes[0];
            c = c * 2.0 / N;
            //decoded_list.push(Math.floor(c));
            decoded_list.push(c);
        }
        // console.log("decoded_list:", decoded_list);
        return decoded_list;
    }

    ProgTest.prototype.waveletEncoding = function(data) {
        let testResult = {};
        _.each(this.data, (locations, state) => {

        });
        return testResult;
    }

    ProgTest.prototype.getAverageResults = function(dict) {
        let size = 0;
        let result = 0;
        _.each(dict, (value, key) => {
            result = result + value;
            size = size + 1;
        })
        return result / size;
    }

    return ProgTest;
})();

module.exports = {
    ProgTest: ProgTest
};