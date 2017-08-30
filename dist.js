var EventEmitter = require("events");
var _ = require("underscore");
var gaussian = require('gaussian');
var extend = function(child, parent) { for (var key in parent) { if (hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
    hasProp = {}.hasOwnProperty;
var sylvester = require('sylvester'),
    Matrix = sylvester.Matrix,
    Vector = sylvester.Vector;

//
// an internal helper function so that queries can be keyed in a dictionary
// nothing to do with datastructres' key functions.
//
function qToKey(q) {
    return q.template.id + ":" + JSON.stringify(q.data);
}
function qToIndex(q) {
    return q.index || 0;
}

// Models a distribution  at a single instant in time.
// The code doesn't support predicting into the future yet.
//
// A Distribution implements
//
//  set(object, prob) --> set the probability of object
//  get(object)       --> return some probabiity value
//  getAllAbove(prob) --> [ [ object, probability]* ]
//  toWire()          --> JSON object to send to the server
//  format: {"time1":[[{query1}, prob1], [{query2}, prob2], ...], ...}
//
//
// subclass DistributionBase for specific types of distributions
// The reason for subclasses is that we may want more efficient representations of  to predict mouse
// positions in a discretized fashion, rather than on a pixel by pixel basis.
// If this is the case, then there may be more efficient representations.
//

var DistributionBase = (function() {
    function DistributionBase() {};

    // get the probability of some object, or 0 if not found
    DistributionBase.prototype.get = function(o) {
        return 0;
    };

    // @prob minimum probability for returned list
    // @return the list of all objects and their probabilities for all
    // objects whose probability is above @param{prob}
    DistributionBase.prototype.getAllAbove = function(prob) {
        return [];
    };

    // @k  the maximum number of objects to return
    // @return the top k objects by probability
    DistributionBase.prototype.getTopK = function(k) {
        return [];
    };

    // to a JSON-able representation that we can pass to jquery
    // aka a dictionary
    DistributionBase.prototype.toWire = function() {
        var pairs = this.getAllAbove(0);
        for (var i = 0; i < pairs.length; i++) {
            pairs[i][0] = pairs[i][0].toWire();
        }
        return pairs;
    }

    DistributionBase.prototype.getArea = function(qs) {
        return 0;
    }

    return DistributionBase;
})();



//
// Simplest distribution object
//
var NaiveDistribution = (function(Base) {
    extend(NaiveDistribution, Base);

    NaiveDistribution.from = function(q, keyFunc) {
        var d = new NaiveDistribution(keyFunc);
        d.set(q, 1);
        return d;
    };


    // @keyFunc is a function that takes a "query" as input and returns a string used as a key in the hash table
    //          by default it will use qToKey defined at the top of this file, but you can define your own
    function NaiveDistribution(keyFunc) {
        this.keyFunc = keyFunc || qToKey;
        this.dist = {};
        this.empty = true;
        // call parent constructor
        Base.call(this);
    }

    NaiveDistribution.prototype.set = function(q, prob) {
        this.dist[this.keyFunc(q)] = [q, prob];
        this.empty = false;
    };

    NaiveDistribution.prototype.get = function(q) {
        if (q == null || q === undefined) return 0;
        var key = this.keyFunc(q);
        if (key in this.dist) return this.dist[key][1];
        return 0;
    };

    NaiveDistribution.prototype.getAllAbove = function(prob) {
        prob = prob || 0;
        return _.filter(_.values(this.dist), function(pair) {
            return pair[1] >= prob;
        });
    };

    NaiveDistribution.prototype.getTopK = function(k) {
        return _.rest(_.sortBy(_.values(this.dist),
            function(pair) { return pair[1]; }),
            -k);
    };


    return NaiveDistribution;
})(DistributionBase);


var GuassianDistribution = (function(Base) {
    extend(GuassianDistribution, Base);

    GuassianDistribution.from = function(q, keyFunc) {
        var d = new GuassianDistribution(keyFunc);
        d.set(q, 1);
        return d;
    };

    function GuassianDistribution(keyFunc, gaussianX, gaussianY) {
        this.keyFunc = keyFunc || qToKey;
        this.dist = {};
        this.gaussianX = gaussianX;
        this.gaussianY = gaussianY;
        // call parent constructor
        Base.call(this);
    }

    GuassianDistribution.prototype.set = function(q, prob) {
        this.dist[this.keyFunc(q)] = [q, prob];
    };

    GuassianDistribution.prototype.get = function(q) {
        if (q == null || q === undefined) return 0;
        var key = this.keyFunc(q);
        if (key in this.dist) return this.dist[key][1];
        return 0;
    };
    GuassianDistribution.prototype.getArea = function(qs) {
        if (qs == null || qs === undefined) return 0;
        let topright = this.gaussianX.cdf(qs[0][0]) * this.gaussianY.cdf(qs[0][1]);
        let topleft = this.gaussianX.cdf(qs[1][0]) * this.gaussianY.cdf(qs[1][1]);
        let bottomright = this.gaussianX.cdf(qs[2][0]) * this.gaussianY.cdf(qs[2][1]);
        let bottomleft = this.gaussianX.cdf(qs[3][0]) * this.gaussianY.cdf(qs[3][1]);

        let results = _.sortBy([topright, topleft, bottomright, bottomleft], function(num) {
            return num;
        })
        return (results[3] - results[2] - results[1] + results[0]);
    };
    GuassianDistribution.prototype.getAllAbove = function(prob) {
        prob = prob || 0;
        return _.filter(_.values(this.dist), function(pair) {
            return pair[1] >= prob;
        });
    };

    GuassianDistribution.prototype.getTopK = function(k) {
        return _.rest(_.sortBy(_.values(this.dist),
            function(pair) { return pair[1]; }),
            -k);
    };


    return GuassianDistribution;
})(DistributionBase);

//
// time distribution object
//
var TimeDistribution = (function(Base) {
    extend(TimeDistribution, Base);
    TimeDistribution.from = function(q, keyFunc) {
        var d = new TimeDistribution(keyFunc);
        d.set(q, 1, 0);
        return d;
    };


    // @keyFunc is a function that takes a "query" as input and returns a string used as a key in the hash table
    //          by default it will use qToKey defined at the top of this file, but you can define your own
    function TimeDistribution(keyFunc, timesteps, indexFunc) {
        this.keyFunc = keyFunc || qToKey;
        this.indexFunc = indexFunc || qToIndex;
        this.dist = {};
        this.compressedDist = {};
        this.templates = [];
        this.timesteps = timesteps || [0];
        // call parent constructor
        Base.call(this);
    }
    TimeDistribution.prototype.toWire = function() {
        let json = {};
        _.each(this.timesteps, time => {
            let pairs = this.getAllAbove(0, time);
            for (var i = 0; i < pairs.length; i++) {
                pairs[i][0] = pairs[i][0].toWire();
            }
            json[time] = pairs;
        });
        return json;
    }
    TimeDistribution.prototype.addNaiveDist = function(naive, time, K) {
        if (naive && !naive.empty) {
            let sum = 0;
            let sum_check = 0;
            let topK = naive.getTopK(K);
            _.each(topK, element => {
                sum = sum + element[1];
            });
            _.each(topK, element => {
                element[1] = element[1] / sum;
            });
            _.each(topK, element => {
                sum_check = sum_check + element[1];
            });
            let dist = {};
            _.each(topK, element => {
                if (!this.templates.includes(element[0].template.id))
                    this.templates.push(element[0].template.id);
                dist[this.keyFunc(element[0])] = element;
            });
            this.dist[time] = dist;
        }
    };

    TimeDistribution.prototype.set = function(q, prob, time) {
        if (!(time in this.dist)) {this.dist[time] = {}}
        this.dist[time][this.keyFunc(q)] = [q, prob];
    };

    TimeDistribution.prototype.get = function(q, time) {
        if (q == null || q === undefined) return 0;
        var key = this.keyFunc(q);
        if (time in this.dist && key in this.dist[time]) return this.dist[time][key][1];
        return 0;
    };

    TimeDistribution.prototype.getAllAbove = function(prob, time) {
        prob = prob || 0;
        return _.filter(_.values(this.dist[time]), function(pair) {
            return pair[1] >= prob;
        });
    };

    TimeDistribution.prototype.getTopK = function(k, time) {
        return _.rest(_.sortBy(_.values(this.dist[time]),
            function(pair) { return pair[1]; }),
            -k);
    };

    TimeDistribution.prototype.lightCompression = function () {
        _.each(this.dist, (distribution, time) => {
            let distByTemplate = {};
            let template = {};
            _.each(distribution, (tuple, key) => {
                const query = tuple[0];
                const prob = tuple[1];
                const id = query.template.id;
                if (!(id in distByTemplate)) {
                    distByTemplate[id+""] = [];
                    template[id+""] = [];
                    _.each(query.template.params, (type, para) => {
                        template[id+""].push(para);
                        distByTemplate[id+""].push([]);
                    });
                    distByTemplate[id+""].push([]);
                }
                _.each(query.data, (value, para) => {
                    const index = template[id+""].indexOf(para);
                    distByTemplate[id+""][index].push(value);
                });
                distByTemplate[id+""][distByTemplate[id+""].length - 1].push(prob);
            });
            this.compressedDist[time+""] = distByTemplate;
        });
    };
    TimeDistribution.prototype.dictionaryEncoding = function () {
        const maxX = 100;
        const maxY = 100;
        const max = maxX * maxY;
        var hashCodeX = function(s){
            return Math.abs(s.split("").reduce(function(a,b){a=((a<<5)-a)+b.charCodeAt(0);return a&a},0) % maxX);
        };
        var hashCodeY = function(str){
            let hash = 0;
            for (let i = 0; i < str.length; i++) {
                let char = str.charCodeAt(i);
                hash = char + (hash << 6) + (hash << 16) - hash;
            }
            return Math.abs(hash) % maxY;
        };
        let hash_map = [];
        for(let i = 0; i < max; i++) {
            hash_map[i] = 0;
        }
        _.each(this.dist, (distribution, time) => {
            _.each(distribution, (tuple, key) => {
                key = time + ":" + key;
                const hashX = hashCodeX(key);
                const hashY = hashCodeY(key);
                // console.log(hashX, hashY);
                hash_map[hashX * maxY + hashY] = tuple[1];
            });
        });
        let compressed_list = [];
        let cnt = 0;
        for(let i = 0; i < hash_map.length; i++) {
            if (hash_map[i] !== 0) {
                compressed_list.push(cnt);
                compressed_list.push(hash_map[i]);
                cnt = 0;
            }
            else {
                cnt++;
            }
        }
        this.compressedDist = compressed_list;
    };

    TimeDistribution.prototype.modelEncodingGaussian = function () {
        let model_dist = {};
        _.each(this.dist, (distribution, time) => {
            const probs = _.map(Object.values(distribution));
            const mean = _.reduce(probs, (memo, num)=>{ return memo + num[1] * this.indexFunc(num[0]); }, 0);
            const variance =  _.reduce(probs, (memo, num)=>{ return memo + num[1] * Math.pow((this.indexFunc(num[0]) - mean), 2); }, 0);
            const gaussianDist = gaussian(mean, variance);
            model_dist[time + ""] = [mean, variance];
            // decoding
            // _.each(probs, element => {
            //     console.log(this.keyFunc(element[0]), gaussianDist.pdf(this.indexFunc(element[0])))
            // });
        });
        this.compressedDist = model_dist;
    };
    TimeDistribution.prototype.modelEncodingPolynomial = function () {
        let model_dist = {};
        const n = 5;
        const m = 3;
        let X = Matrix.Random(n, m);
        _.each(this.dist, (distribution, time) => {
            const probs = Object.values(distribution);
            const center = _.reduce(probs, (mem, element) =>{return mem + element[0].index; }, 0) / probs.length;
            let Y = Matrix.Random(n, 1);
            for(let i = 0; i < n; i++) {
                Y.elements[i][0] = probs[i][1];
                for(let j = 0; j <= m; j++) {
                    X.elements[i][j] = Math.pow(probs[i][0].index - center, j);
                }
            }
            let beta = (X.transpose().x(X)).inverse().x(X.transpose()).x(Y);

            model_dist[time+""] = [[], center];
            for(let i = 0; i < beta.col(1).elements.length; i++) {
                model_dist[time+""][0].push(beta.col(1).elements[i]);
            }
        });
        this.compressedDist = model_dist;
    };


    return TimeDistribution;
})(DistributionBase);




module.exports = {
    DistributionBase: DistributionBase,
    NaiveDistribution: NaiveDistribution,
    GuassianDistribution: GuassianDistribution,
    TimeDistribution: TimeDistribution
};