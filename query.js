var parser = require("jssqlparser");
var EventEmitter = require("events");
var _ = require("underscore");
var extend = function(child, parent) { for (var key in parent) { if (hasProp.call(parent, key)) child[key] = parent[key]; } function ctor() { this.constructor = child; } ctor.prototype = parent.prototype; child.prototype = new ctor(); child.__super__ = parent.prototype; return child; },
    hasProp = {}.hasOwnProperty;



//
// A query is simply an object that exposes parameters that can be set, and can generate a SQL string
//
var QueryTemplateBase = (function(EventEmitter) {
    extend(QueryTemplateBase, EventEmitter);
    QueryTemplateBase.name = "querybase";

    function QueryTemplateBase() {
        EventEmitter.call(this);
    }

    // @return a list of parameter name and type [ {name:, type: }]
    //         type can be "num", "str"
    QueryTemplateBase.prototype.getParamNames = function() {
        return [];
    }

    // @return query string, or null if params are invalid in some way
    QueryTemplateBase.prototype.toSQL = function(params) {
        return null;
    }

    // @return javascript JSON-able representation to be sent to the server
    QueryTemplateBase.prototype.toWire = function() {
        return this.toSQL({});
    }

    return QueryTemplateBase;
})(EventEmitter);



//
// Highly constrained subset of single-table olap queries
//
// JS version of the query templates supported by py/ds.py:GBDataStruct
var GBQueryTemplate = (function(QueryTemplateBase) {
    extend(GBQueryTemplate, QueryTemplateBase);

    // @param select: a mapping from output alias to an expression string
    //         { x: "month", y: "avg(salary)" }
    // @param from:   table name
    // @param groupby list of groupby strings
    //         [ "month" ]
    // @param params: a mapping from an attribute to its data type.
    //         specifies the attribute predicates in the WHERE clause
    //
    //         for example, if params is { "hour": "num" }
    //         then setting "hour" to 1 is the same as adding
    //
    //           WHERE hour = 1
    //         to the query
    //
    function GBQueryTemplate(select, from, groupby, params) {
        this.select = select;
        this.from = from;
        this.groupby = groupby;
        this.params = params || {};
        this.name = "gbquery"
        QueryTemplateBase.call(this);
    }

    GBQueryTemplate.prototype.getParamNames = function() { return this.params; }

    GBQueryTemplate.prototype.toSQL = function(params) {
        // which of the arguments are allowed by this.params?
        var p = {};
        params = params || {};
        for (var key in this.params) {
            if (key in params && !_.isNull(params[key])) {
                p[key] = params[key]
            }
        }

        var sel = _.map(this.select, function(e, alias) {
            return e + " AS " + alias;
        }).join(", ");

        var gb = this.groupby.join(", ");

        // TODO: make work for str attr types too.  Either way, not very secure..
        var where = _.map(p, function(v, attr) { return attr + " = " + v; });
        where = where.join(" AND ");
        where = (where.length > 0)? " WHERE " + where : "";

        var sql = ["SELECT", sel, "FROM", this.from, where, "GROUP BY", gb].join(" ");
        return sql;
    }

    GBQueryTemplate.prototype.toWire = function() {
        return {
            tid: this.id,
            name: this.name,
            select: this.select,
            from: this.from,
            fr: this.from,
            groupby: this.groupby,
            params: this.params
        };
    }

    return GBQueryTemplate;
})(QueryTemplateBase);

//
// Highly constrained subset of single-table olap queries
//
// JS version of the query templates supported by py/ds.py:GBDataStruct
var LikeQueryTemplate = (function(QueryTemplateBase) {
    extend(LikeQueryTemplate, QueryTemplateBase);

    // @param select: a mapping from output alias to an expression string
    //         { x: "month", y: "avg(salary)" }
    // @param from:   table name
    // @param like list of like strings
    //         [ "month" ]
    // @param params: a mapping from an attribute to its data type.
    //         specifies the attribute predicates in the WHERE clause
    //
    //         for example, if params is { "hour": "num" }
    //         then setting "hour" to 1 is the same as adding
    //
    //           WHERE hour = 1
    //         to the query
    //
    function LikeQueryTemplate(select, from, like, params) {
        this.select = select;
        this.from = from;
        this.like = like;
        this.params = params || {};
        this.name = "like"
        QueryTemplateBase.call(this);
    }

    LikeQueryTemplate.prototype.getParamNames = function() { return this.params; }

    LikeQueryTemplate.prototype.toSQL = function(params) {
        // which of the arguments are allowed by this.params?
        var p = {};
        params = params || {};
        for (var key in this.params) {
            if (key in params && !_.isNull(params[key])) {
                p[key] = params[key]
            }
        }

        var sel = _.map(this.select, function(e, alias) {
            return e + " AS " + alias;
        }).join(", ");

        // TODO: make work for str attr types too.  Either way, not very secure..
        var where = _.map(p, function(v, attr) {
            v = "'%" + v + "%'";
            return attr + " LIKE " + v;
        });
        where = where.join(" AND ");
        where = (where.length > 0)? " WHERE " + where : "";

        var sql = ["SELECT", sel, "FROM", this.from, where].join(" ");
        return sql;
    }

    LikeQueryTemplate.prototype.toWire = function() {
        return {
            tid: this.id,
            name: this.name,
            select: this.select,
            from: this.from,
            fr: this.from,
            like: this.like,
            params: this.params
        };
    }

    return LikeQueryTemplate;
})(QueryTemplateBase);

//var q = new GBQueryTemplate({x: "avg(sal)", y: "sum(sal)"}, "data", ["month"], { a: "num", b: "num"});
//console.log(q.toSQL({a: 1, b: 99}))


// Uses jssqlparser package to parse a parameterized query string into a query object
//
// XXX: We don't use this because it requires a corresponding SQL parser on the server,
//      which we don't have.
//
var QueryTemplate = (function(QueryTemplateBase) {
    extend(QueryTemplate, QueryTemplateBase);
    QueryTemplate.name = "query";

    function QueryTemplate(qstr) {
        this.qstr = qstr;
        this.parsed = parser.one(qstr);
        QueryTemplateBase.call(this);
    }

    QueryTemplate.prototype.getParamNames = function() {
        var o = {};
        _.each(this.parsed.descendents("ParamVar"), function(pvar) {
            // XXX: assumes everything is a number
            o[pvar.name] = "num";
        });
        return o;
    };

    QueryTemplate.prototype.toSQL = function(params) {
        // TODO: apply params to sql AST
        return this.parser.toSQL();
    }

    // @param data is the dictionary of parameter -> value mappings
    //        due to name conflict it's called "data" here rather than "params"
    QueryTemplate.prototype.toWire = function() {
        return {
            tid: (this.id || -1),
            name: QueryTemplate.name,
            qstr: this.qstr
        };
    };

    return QueryTemplate;
})(QueryTemplateBase);




// A query is simply a query template (one of the above classes) and a dictionary of
// parameter values
var Query = (function(EventEmitter) {
    extend(Query, EventEmitter);

    function Query(template, data) {
        this.template = template;
        this.data = data;
        EventEmitter.call(this);
    }

    // Return a query string, or null if params are invalid in some way
    Query.prototype.toSQL = function() {
        return this.template.toSQL(this.data);
    };

    Query.prototype.toWire = function() {
        return {
            template: this.template.id,
            data: this.data
        };
    };

    return Query;
})(EventEmitter);

module.exports = {
    GBQueryTemplate: GBQueryTemplate,
    LikeQueryTemplate: LikeQueryTemplate,
    Query: Query
};