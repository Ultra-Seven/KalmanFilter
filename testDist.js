const Dist = require("./dist");
const Query = require("./query");
const _ = require("underscore");
const gaussian = require("gaussian");
const timeRange = [20, 50, 100];
const baseDist = new Dist.TimeDistribution(null, timeRange, null);
const timeDist = new Dist.TimeDistribution(null, timeRange, null);
const q1 = new Query.GBQueryTemplate(
    {
        x: "Latitude",
        y: "Longitude",
        fill: "'black'"
    },
    "data",
    ["Longitude", "Latitude"],
    {"State": "str"}
);
const q2 = new Query.GBQueryTemplate(
    {
        x: "Latitude",
        y: "Longitude",
        fill: "'black'"
    },
    "data",
    ["Longitude", "Latitude"],
    {"City": "str"}
);
q1.id = 1;
q2.id = 2;
const number = 10;
function getNaiveDist() {
    const mean = 100 + number - Math.random() ;
    const variance = Math.random() * 3;
    const gaussianDist = gaussian(mean, variance);
    const naive = new Dist.NaiveDistribution(null);
    let sum = _.reduce(_.range(number), (mem, num)=>{ return mem + num}, 0) * 2;
    for(let i = 0; i < number * 2; i++) {
        const index = 100 + i;
        let query = new Query.Query(q1, {State: ("C" + index)});
        query.index = index;
        naive.set(query, gaussianDist.pdf(index));
    }
    return naive;
}
function initializeDistribution(scheduler) {
    _.each(timeRange, (time, idx) => {
        if (scheduler === 0) {
            if (idx === 0) {
                const naive = getNaiveDist();
                timeDist.addNaiveDist(naive, time, number);
                baseDist.addNaiveDist(naive, time, number);
            }
        }
        else if (scheduler === 1) {
            const naive = getNaiveDist();
            timeDist.addNaiveDist(naive, time, number / 2);
            baseDist.addNaiveDist(naive, time, number / 2);
        }
        else {
            const naive = getNaiveDist();

            timeDist.addNaiveDist(naive, time, number);
            baseDist.addNaiveDist(naive, time, number);
        }
    });
}
let bytes = {"A1":[], "A2":[], "A3":[], "A4":[], "Baseline":[]};
function testLength() {
    let start = new Date();
    timeDist.lightCompression();
    bytes["A1"].push(JSON.stringify(timeDist.compressedDist).length);
    console.log("Approach 1:\n length:" + JSON.stringify(timeDist.compressedDist).length + ", CPU time:" +  (new Date() - start));
    let start2 = new Date();
    timeDist.dictionaryEncoding();
    bytes["A2"].push(JSON.stringify(timeDist.compressedDist).length);
    console.log("Approach 2:\n length:" + JSON.stringify(timeDist.compressedDist).length + ", CPU time:" +  (new Date() - start2));
    let start3 = new Date();
    timeDist.modelEncodingGaussian();
    bytes["A3"].push(JSON.stringify(timeDist.compressedDist).length);
    console.log("Approach 3:\n length:" + JSON.stringify(timeDist.compressedDist).length + ", CPU time:" +  (new Date() - start3));
    let start4 = new Date();
    timeDist.modelEncodingPolynomial();
    bytes["A4"].push(JSON.stringify(timeDist.compressedDist).length);
    console.log("Approach 4:\n length:" + JSON.stringify(timeDist.compressedDist).length + ", CPU time:" +  (new Date() - start4));
    let start5 = new Date();
    let wire = baseDist.toWire();
    bytes["Baseline"].push(JSON.stringify(wire).length);
    console.log("Baseline:\n length:" + JSON.stringify(wire).length + ", CPU time:" +  (new Date() - start5));
}
function decodeGaussian(encode_dist) {
    let decode_dist = {};
    _.each(encode_dist, (params, time)=> {
        let dist = {};
        const mean = params[0];
        const variance = params[1];
        const gaussianDist= gaussian(mean, variance);
        const start = Math.round(params[0]) - number / 2;
        for(let i = 0; i < number; i++) {
            const key = (start + i);
            dist[key + ""] = gaussianDist.pdf(key);
        }
        decode_dist[time + ""] = dist;
    });
    return decode_dist;
}

function decodePolynomial(encode_dist) {
    const num = 200;
    let decode_dist = {};
    _.each(encode_dist, (params, time)=> {
        let dist = {};
        const betas = params[0];
        for(let i = 0; i < num; i++) {
            const x = i - params[1];
            let prob = 0;
            _.each(betas, (coefficient, idx) => {
                prob = prob + coefficient * Math.pow(x, idx);
            });
            if (prob > 0 && prob < 1) {
                dist[i+""] = prob;
            }
        }
        let keys = _.sortBy(Object.keys(dist), function(num){ return -dist[num]; }).slice(0, number + 1);
        let time_dist = {};
        _.each(keys, key => {
           time_dist[key] =  dist[key];
        });
        console.log(time_dist);
        decode_dist[time + ""] = time_dist;
    });
    return decode_dist;
}
function testAccuracy(raw_dist, decode_dist) {
    let distances = {};
    _.each(raw_dist, (distribution, time) => {
        let distance = 0;
        _.each(distribution, (element, key) => {
           const index = element[0].index;
           const prob = element[1];

           const decode_prob = decode_dist[time][index+""] || 0;
           distance = distance + Math.abs((decode_prob - prob));
        });
        distances[time + ""] = distance;
    });
    return distances;
}
// const testTime = 100;
// for(let i = 0; i < testTime; i++) {
//     initializeDistribution(2);
//     testLength();
// }
// let baseline = _.reduce(bytes["Baseline"], (mem, num) => {return num}, 0) / bytes["Baseline"].length;
// _.each(bytes, (results, name) => {
//     let average = _.reduce(results, (mem, num) => {return num}, 0) / results.length;
//     console.log("[" + name + "]:" + (baseline / average));
// });

// timeDist.modelEncodingGaussian();
// timeDist.modelEncodingPolynomial();
// let decode_Dist = decodeGaussian(timeDist.compressedDist);
// let decode_Dist = decodePolynomial(timeDist.compressedDist);
// console.log("distance:", testAccuracy(timeDist.dist, decode_Dist));
// console.log(decodeGaussian(timeDist.compressedDist));
