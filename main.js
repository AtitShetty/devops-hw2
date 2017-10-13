var esprima = require("esprima");
var options = {
    tokens: true,
    tolerant: true,
    loc: true,
    range: true
};
var faker = require("faker");
var fs = require("fs");
faker.locale = "en_US";
var mock = require('mock-fs');
var _ = require('underscore');
var Random = require('random-js');
var Combinatorics = require('js-combinatorics');
var engine = Random.engines.mt19937().autoSeed();
var randomizer = new Random(engine);

var fileName = "";

function main() {

    var args = process.argv.slice(2);

    if (args.length == 0) {
        args = ["subject.js"];
    }
    var filePath = args[0];

    fileName = filePath.slice(0, filePath.indexOf("."));

    constraints(filePath);

    generateTestCases();

}

function Constraint(properties) {
    this.ident = properties.ident;
    this.expression = properties.expression;
    this.operator = properties.operator;
    this.value = properties.value;
    this.funcName = properties.funcName;
    // Supported kinds: "fileWithContent","fileExists"
    // integer, string, phoneNumber
    this.kind = properties.kind;
}

function constraints(filePath) {
    var buf = fs.readFileSync(filePath, "utf8");
    var result = esprima.parse(buf, options);

    traverse(result, function(node) {
        if (node.type === 'FunctionDeclaration') {
            var funcName = functionName(node);
            console.log("Line : {0} Function: {1}".format(node.loc.start.line, funcName));

            var params = node.params.map(function(p) {
                return p.name;
            });

            functionConstraints[funcName] = {
                constraints: [],
                constraintsProperty: [],
                params: params
            };

            // Check for expressions using argument.
            traverse(node, function(child) {
                if (child.type === 'BinaryExpression' && (child.operator == "==" || child.operator == "!=")) {
                    // get expression from original source code:
                    var expression = buf.substring(child.range[0], child.range[1]);
                    var rightHand = buf.substring(child.right.range[0], child.right.range[1]);

                    if (child.left.type == 'Identifier' && child.left.name == 'area') {
                        var fakePhone = String(faker.phone.phoneNumberFormat());
                        var propValue = fakePhone.slice(child.right.value.length);
                        propValue = child.right.value + propValue;
                        functionConstraints[funcName].constraints.push(
                            new Constraint({
                                ident: params[0],
                                value: ["'" + propValue + "'", "'" + fakePhone + "'"],
                                funcName: funcName,
                                kind: "string",
                                operator: child.operator,
                                expression: expression
                            }));
                    }

                    if (child.left.type == 'Identifier' && params.indexOf(child.left.name) > -1) {


                        if (rightHand == "undefined") {
                            functionConstraints[funcName].constraints.push(
                                new Constraint({
                                    ident: child.left.name,
                                    value: [rightHand, "''"],
                                    funcName: funcName,
                                    kind: "undefined",
                                    operator: child.operator,
                                    expression: expression
                                }));
                        } else if (isNaN(rightHand)) {

                            var altvalue = rightHand;

                            while (altvalue != rightHand) {
                                altvalue = Random.string(rightHand.length);
                            }

                            functionConstraints[funcName].constraints.push(
                                new Constraint({
                                    ident: child.left.name,
                                    value: [rightHand, altvalue],
                                    funcName: funcName,
                                    kind: "string",
                                    operator: child.operator,
                                    expression: expression
                                }));
                        } else {

                            functionConstraints[funcName].constraints.push(
                                new Constraint({
                                    ident: child.left.name,
                                    value: [rightHand, (rightHand + 1)],
                                    funcName: funcName,
                                    kind: "number",
                                    operator: child.operator,
                                    expression: expression
                                }));
                        }

                    } else if (child.left.type == 'CallExpression' &&
                        child.left.callee && child.left.callee.type == "MemberExpression") {
                        if (child.left.callee.property.name == "indexOf" &&
                            params.indexOf(child.left.callee.object.name) > -1) {
                            var position = Number(rightHand);
                            var argument = child.left.arguments[0].value;
                            var altvalue = "";
                            if (position >= 0) {
                                rightHand = randomizer.string(position) + argument;
                                altvalue = randomizer.string((position + argument.length));
                            } else {
                                rightHand = randomizer.string(argument.length);
                                altvalue = argument;
                            }

                            functionConstraints[funcName].constraints.push(
                                new Constraint({
                                    ident: child.left.callee.object.name,
                                    value: ["\"" + rightHand + "\"", "\"" + altvalue + "\""],
                                    funcName: funcName,
                                    kind: "number",
                                    operator: child.operator,
                                    expression: expression
                                }));
                        }
                    }
                }

                if (child.type === 'BinaryExpression' && (child.operator == "<" || child.operator == ">")) {
                    if (child.left.type == 'Identifier' && params.indexOf(child.left.name) > -1) {
                        // get expression from original source code:
                        var expression = buf.substring(child.range[0], child.range[1]);
                        var rightHand = buf.substring(child.right.range[0], child.right.range[1]);

                        functionConstraints[funcName].constraints.push(
                            new Constraint({
                                ident: child.left.name,
                                value: [(parseInt(rightHand) - 1), (parseInt(rightHand) + 1)],
                                funcName: funcName,
                                kind: "integer",
                                operator: child.operator,
                                expression: expression
                            }));
                    }
                }

                if (child.type === 'UnaryExpression' && child.operator == '!') {
                    if (child.argument.type == "Identifier" && params.indexOf(child.argument.name) > -1) {
                        var expression = buf.substring(child.range[0], child.range[1]);

                        functionConstraints[funcName].constraints.push(
                            new Constraint({
                                ident: child.argument.name,
                                value: [false, true],
                                funcName: funcName,
                                kind: "boolean",
                                operator: child.operator,
                                expression: expression
                            }));
                    } else if (child.argument.type == "MemberExpression" &&
                        child.argument.property &&
                        child.argument.object.type == "Identifier" &&
                        params.indexOf(child.argument.object.name) > -1) {
                        functionConstraints[funcName].constraints.push(
                            new Constraint({
                                ident: child.argument.object.name,
                                value: [child.argument.object.name + "1", child.argument.object.name + "2"],
                                funcName: funcName,
                                kind: "normalize",
                                operator: child.operator,
                                expression: expression
                            }));
                    }

                }

                if (child.type == "CallExpression" &&
                    child.callee.property &&
                    child.callee.property.name == "readFileSync") {
                    for (var p = 0; p < params.length; p++) {
                        if (child.arguments[0].name == params[p]) {
                            functionConstraints[funcName].constraints.push(
                                new Constraint({
                                    ident: params[p],
                                    value: ["'pathContent/fileWithContent.txt'",
                                        "'pathContent/fileDoesNotExists.txt'",
                                        "'pathContent/fileWithNoContent.txt'"
                                    ],
                                    funcName: funcName,
                                    kind: "file",
                                    operator: child.operator,
                                    expression: expression
                                }));
                        }
                    }
                }

                if (child.type == "CallExpression" &&
                    child.callee.property &&
                    child.callee.property.name == "readdirSync") {
                    for (var p = 0; p < params.length; p++) {
                        if (child.arguments[0].name == params[p]) {
                            functionConstraints[funcName].constraints.push(
                                new Constraint({
                                    ident: params[p],
                                    value: ["'path/to/dir'", "'path/to/emptyDir'", "'path/to/doesNotExist'"],
                                    funcName: funcName,
                                    kind: "dirOrFile",
                                    operator: child.operator,
                                    expression: expression
                                }));
                        }
                    }
                }



            });

            console.log(functionConstraints[funcName]);

        }
    });
}

function generateTestCases() {

    var content = "var " + fileName + " = require('./" + fileName + ".js')\nvar mock = require('mock-fs');\n";
    for (var funcName in functionConstraints) {

        var params = initalizeParams(functionConstraints[funcName])

        var constraints = functionConstraints[funcName].constraints;

        var readFile = _.some(constraints, {
            kind: 'file'
        });
        var dirOrFile = _.some(constraints, {
            kind: 'fileExists'
        });

        var hasProperty = _.some(constraints, {
            kind: 'normalize'
        });

        argList = fillParams(constraints, params, "value")

        if (hasProperty) {
            content += "var options1 = {'normalize':true};\n";
            content += "var options2 = {'normalize':false};\n";
        }

        if (readFile || dirOrFile) {
            content += generateMockFsTestCases(false);
        }
        for (var i in argList) {
            var args = argList[i].map(function(k) {
                return k;
            }).join(",");
            content += fileName + ".{0}({1});\n".format(funcName, args);
        }

        if (readFile || dirOrFile) {
            content += generateMockFsTestCases(true);
        }

    }

    fs.writeFileSync('test.js', content, "utf8");

}

function initalizeParams(constraints) {
    var params = {};

    // initialize params
    for (var i = 0; i < constraints.params.length; i++) {
        var paramName = constraints.params[i];
        params[paramName] = [];
    }
    return params;
}

function fillParams(constraints, params, property) {
    // plug-in values for parameters
    for (var c = 0; c < constraints.length; c++) {
        var constraint = constraints[c];
        if (params.hasOwnProperty(constraint.ident)) {
            constraint['value'].map(function(ele) {
                params[constraint.ident].push(ele);
            });
        }
    }

    for (var i in params) {
        if (params[i].length == 0) {
            params[i].push('\'\'');
        }
    }

    var str = Object.keys(params).map(function(ele) {
        return "params['" + ele + "']";
    }).join(",");

    return eval("Combinatorics.cartesianProduct(" + str + ").toArray()");

}

function generateMockFsTestCases(restore) {
    if (!restore) {
        var mockFileSystem = {
            "pathContent/fileWithContent.txt": "file content here",
            "pathContent/fileWithNoContent.txt": "",
            "path/to/dir": {
                "file1": "file content"
            },
            "path/to/emptyDir": {}
        }

        return "mock(" + JSON.stringify(mockFileSystem) + ");\n"
    } else {
        return "mock.restore();\n"
    }
}

var functionConstraints = {}

function traverse(object, visitor) {
    var key, child;

    visitor.call(null, object);
    for (key in object) {
        if (object.hasOwnProperty(key)) {
            child = object[key];
            if (typeof child === 'object' && child !== null) {
                traverse(child, visitor);
            }
        }
    }
}

function traverseWithCancel(object, visitor) {
    var key, child;

    if (visitor.call(null, object)) {
        for (key in object) {
            if (object.hasOwnProperty(key)) {
                child = object[key];
                if (typeof child === 'object' && child !== null) {
                    traverseWithCancel(child, visitor);
                }
            }
        }
    }
}

function functionName(node) {
    if (node.id) {
        return node.id.name;
    }
    return "";
}


if (!String.prototype.format) {
    String.prototype.format = function() {
        var args = arguments;
        return this.replace(/{(\d+)}/g, function(match, number) {
            return typeof args[number] != 'undefined' ?
                args[number] :
                match;
        });
    };
}

main();
exports.main = main;
