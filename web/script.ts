module PrettyPrinter {

    var fontFamily = "'DejaVu Sans Mono', 'Consolas', 'Menlo', monospace";
    var fontSize = '10pt';
    var padding = '0.25em';
    var borderWidth = '0.125em';

    function inlineBlock(inner:Node):HTMLElement {
        var s = document.createElement('div');
        s.style.display = 'inline-block';
        s.appendChild(inner);
        return s;
    }

    function block(node:Node):HTMLElement {
        var div = document.createElement('div');
        div.appendChild(node);
        return div;
    }

    function text(text:string):Node {
        return document.createTextNode(text);
    }

    function wrap(t:string):HTMLElement {
        return inlineBlock(text(t));
    }

    function italics(text:string):Node {
        var wrapped = wrap(text);
        wrapped.style.fontStyle = 'italic';
        return wrapped;
    }

    function notice(text:string):Node {
        var wrapped = wrap(text);
        wrapped.style.fontStyle = 'italic';
        wrapped.style.padding = padding;
        return wrapped;
    }

    function collect(nodes:Node[]):Node {
        var x = document.createDocumentFragment();
        for (var i = 0; i < nodes.length; i++)
            x.appendChild(nodes[i]);
        return x;
    }

    function expandable(content:{
        head:Node;
        body:() => Node;
        open:boolean;
    }):Node {
        var container = document.createElement('div');

        var head = document.createElement('div');
        head.style.backgroundColor = '#eee';
        head.style.cursor = 'pointer';
        head.style.padding = padding;
        head.addEventListener('mouseenter', function () {
            head.style.backgroundColor = '#ddd';
            body.style.borderColor = '#ddd';
        });
        head.addEventListener('mouseleave', function () {
            head.style.backgroundColor = '#eee';
            body.style.borderColor = '#eee';
        });
        head.addEventListener('mousedown', function (e) {
            e.preventDefault();
        });
        head.appendChild(content.head);
        container.appendChild(head);

        var body = document.createElement('table');
        body.style.borderSpacing = '0';
        body.style.padding = '0';
        body.style.backgroundColor = 'white';
        body.style.borderColor = '#eee';
        body.style.borderWidth = borderWidth;
        body.style.borderTopWidth = '0px';
        body.style.borderStyle = 'solid';
        body.style.width = '100%';
        container.appendChild(body);

        var open = content.open;

        function refresh() {
            if (open && body.innerHTML.length == 0) {
                var td = document.createElement('td');
                var tr = document.createElement('tr');
                td.style.padding = '0';
                td.appendChild(content.body());
                tr.appendChild(td);
                body.appendChild(tr);
            }

            body.style.display = open ? 'table' : 'none';
        }

        refresh();

        head.addEventListener('click', function () {
            open = !open;
            refresh();
        });

        return container;
    }

    function createTable(data:Node[][]):HTMLTableElement {
        var table = document.createElement('table');
        table.style.borderSpacing = '0';
        table.style.padding = '0';

        for (var i = 0; i < data.length; i++) {
            var tr = document.createElement('tr');
            table.appendChild(tr);
            for (var j = 0; j < data[i].length; j++) {
                var td = document.createElement('td');
                td.style.padding = padding;
                td.style.verticalAlign = 'baseline';
                td.appendChild(data[i][j]);
                tr.appendChild(td);
            }
        }

        return table;
    }

    function bold(content:string):Node {
        var box = wrap(content);
        box.style.fontWeight = 'bold';
        return box;
    }

    function keyword(word:string) {
        var box = wrap(word);
        box.style.color = '#008';
        box.style.fontWeight = 'bold';
        return box;
    }

    interface ValueObjectProperty extends ValueVariable {
        className:string;
        access:string;
    }

    interface ValueArrayEntry {
        key:Value;
        value:Value;
    }

    interface ValueVisitor<T> {
        visitString: (x:string) => T;
        visitBool: (x:boolean) => T;
        visitNull: () => T;
        visitUnknown: () => T;
        visitInt: (x:number) => T;
        visitFloat: (x:number) => T;
        visitResource: (type:string, id:number) => T;
        visitObject: (x:ValueObject) => T;
        visitArray: (entries:ValueArrayEntry[]) => T;
        visitException: (x:ValueException) => T;
    }

    interface ValueObject {
        hash: string;
        className: string;
        properties:ValueObjectProperty[];
        numProperties: number;
    }

    interface ValueExceptionLocation {
        file: string;
        line: number;
        source: {
            [x:number]: string;
        };
    }

    interface ValueStaticVariable extends ValueVariable {
        className: string;
        functionName: string;
    }

    interface ValueVariable {
        name: string;
        value: Value;
    }

    interface ValueExceptionGlobals {
        staticProperties: ValueObjectProperty[];
        staticVariables: ValueStaticVariable[];
        globalVariables: ValueVariable[];
        numStaticProperties: number;
        numStaticVariables: number;
        numGlobalVariables: number;
    }

    interface ValueException {
        className: string;
        code: string;
        message: string;
        location: ValueExceptionLocation;
        locals: ValueVariable[];
        globals: ValueExceptionGlobals;
        stack: ValueExceptionStackFrame[];
        previous: ValueException;
        numStackFrames: number;
        numLocals: number;
    }

    interface ValueExceptionStackFrame {
        object: ValueObject;
        className: string;
        isStatic: boolean;
        functionName: string;
        location: ValueExceptionLocation;
        args: Value[];
        numArgs: number;
    }

    interface Value {
        acceptVisitor<T> (x:ValueVisitor<T>): T;
    }

    function parse(json:string):Value {
        var root = JSON.parse(json);

        function parseLocation(x:any):ValueExceptionLocation {
            if (x === null)
                return null;

            return {
                file:   x['file'],
                line:   x['line'],
                source: x['sourceCode']
            };
        }

        function parseException(e:any):ValueException {
            if (e === null)
                return null;

            var locals:any[] = e['locals'];
            var staticProps:any[] = e['globals']['staticProperties'];
            var staticVars:any[] = e['globals']['staticVariables'];
            var globalVars:any[] = e['globals']['globalVariables'];
            var stack:any[] = e['stack'];

            return {
                className:      e['class'],
                message:        e['message'],
                code:           e['code'],
                location:       parseLocation(e['location']),
                locals:         locals instanceof Array ? locals.map(function (x) {
                    return {
                        name:  x['name'],
                        value: parseValue(x['value'])
                    };
                }) : null,
                globals:        {
                    staticProperties:    staticProps.map(function (x) {
                        return {
                            name:      x['name'],
                            value:     parseValue(x['value']),
                            className: x['class'],
                            access:    x['access']
                        };
                    }),
                    staticVariables:     staticVars.map(function (x) {
                        return {
                            name:         x['name'],
                            value:        parseValue(x['value']),
                            className:    x['class'],
                            functionName: x['function']
                        };
                    }),
                    globalVariables:     globalVars.map(function (x) {
                        return {
                            name:  x['name'],
                            value: parseValue(x['value'])
                        };
                    }),
                    numGlobalVariables:  e['globals']['numGlobalVariables'],
                    numStaticProperties: e['globals']['numStaticProperties'],
                    numStaticVariables:  e['globals']['numStaticVariables']
                },
                stack:          stack.map(function (x) {
                    var args:any[] = x['args'];
                    return {
                        object:       parseObject(x['object']),
                        className:    x['class'],
                        isStatic:     x['isStatic'],
                        functionName: x['function'],
                        args:         args.map(parseValue),
                        location:     parseLocation(x['location']),
                        numArgs:      x['numArgs']
                    };
                }),
                previous:       parseException(e['previous']),
                numLocals:      e['numLocals'],
                numStackFrames: e['numStackFrames']
            };
        }

        function parseObject(x):ValueObject {
            if (x === null)
                return null;

            var object = root['objects'][x];
            var objectProps:any[] = object['properties'];

            return {
                hash:          object['hash'],
                className:     object['class'],
                properties:    objectProps.map(function (x) {
                    return {
                        name:      x['name'],
                        value:     parseValue(x['value']),
                        className: x['class'],
                        access:    x['access']
                    };
                }),
                numProperties: object['numProperties']
            };
        }

        function parseValue(x:any):Value {
            return {
                acceptVisitor: function <T> (v:ValueVisitor<T>):T {
                    if (typeof x === 'string')
                        return v.visitString(x);

                    if (typeof x === 'number')
                        if (x % 1 === 0)
                            return v.visitInt(x);
                        else
                            return v.visitFloat(x);

                    if (typeof x === 'boolean')
                        return v.visitBool(x);

                    if (x === null)
                        return v.visitNull();

                    if (x[0] === 'string-ref')
                        return v.visitString(root['strings'][x[1]]);

                    if (x[0] === 'float')
                        if (x[1] === 'inf' || x[1] === '+inf')
                            return v.visitFloat(Infinity);
                        else if (x[1] === '-inf')
                            return v.visitFloat(-Infinity);
                        else if (x[1] === 'nan')
                            return v.visitFloat(NaN);
                        else
                            return v.visitFloat(x[1]);

                    if (x[0] === 'array') {
                        var arrayEntries:any[] = root['arrays'][x[1]]['entries'];

                        return v.visitArray(arrayEntries.map(function (x) {
                            return {
                                key:   parseValue(x[0]),
                                value: parseValue(x[1])
                            };
                        }));
                    }

                    if (x[0] === 'unknown')
                        return v.visitUnknown();

                    if (x[0] === 'object') {
                        return v.visitObject(parseObject(x[1]));
                    }

                    if (x[0] === 'exception')
                        return v.visitException(parseException(x[1]));

                    if (x[0] === 'resource')
                        return v.visitResource(x[1]['type'], x[1]['id']);

                    throw { message: "not goord" };
                }
            };
        }

        return parseValue(root['root']);
    }

    function render(v:Value):Node {
        function renderArray(entries:ValueArrayEntry[]):Node {
            return inlineBlock(expandable({
                head: keyword('array'),
                body: function () {
                    if (entries.length == 0)
                        return notice('empty');

                    return createTable(entries.map(function (x) {
                        return [
                            render(x.key),
                            text('=>'),
                            render(x.value)
                        ];
                    }));
                },
                open: false
            }));
        }

        function renderObject(object:ValueObject):Node {
            return inlineBlock(expandable({
                head: collect([keyword('object'), text(' ' + object.className)]),
                body: function () {
                    if (object.properties.length == 0)
                        return notice('empty');

                    return createTable(object.properties.map(function (property) {
                        var prefix = '';
                        if (property.className != object.className)
                            prefix = property.className + '::';

                        return [
                            collect([
                                keyword(property.access),
                                text(' ' + prefix),
                                renderVariable(property.name)
                            ]),
                            text('='),
                            render(property.value)
                        ];
                    }));
                },
                open: false
            }));
        }

        function renderStack(stack:ValueExceptionStackFrame[]):Node {
            function renderFunctionCall(call:ValueExceptionStackFrame):Node {
                var result = document.createDocumentFragment();
                var prefix = '';
                if (call.object) {
                    result.appendChild(renderObject(call.object));
                    prefix += '->';
                } else if (call.className) {
                    prefix += call.className;
                    prefix += call.isStatic ? '::' : '->';
                }

                result.appendChild(text(prefix + call.functionName + '('));

                for (var i = 0; i < call.args.length; i++) {
                    if (i != 0)
                        result.appendChild(text(', '));

                    result.appendChild(render(call.args[i]));
                }

                result.appendChild(text(')'));

                return result;
            }

            var rows:Node[][] = [];

            for (var x = 0; x < stack.length; x++) {
                rows.push([
                    text('#' + String(x + 1)),
                    renderLocation(stack[x].location),
                    renderFunctionCall(stack[x])
                ]);
            }

            rows.push([
                text('#' + String(x + 1)),
                inlineBlock(expandable({
                    head: text('{main}'),
                    body: function () {
                        return notice('no source code');
                    },
                    open: false
                })),
                collect([])
            ]);

            return createTable(rows);
        }

        function renderVariable(name:string):Node {
            function red(v:string) {
                var result = wrap(v);
                result.style.color = '#600';
                return result;
            }

            if (/^[a-zA-Z_\x7f-\xff][a-zA-Z0-9_\x7f-\xff]*$/.test(name)) {
                return red('$' + name);
            } else {
                return collect([red('$' + '{'), renderString(name), red('}')])
            }
        }

        function renderLocals(locals:ValueVariable[]):Node {
            if (!(locals instanceof Array))
                return notice('not available');

            if (locals.length == 0)
                return notice('none');

            return createTable(locals.map(function (local) {
                return [
                    renderVariable(local.name),
                    text('='),
                    render(local.value)
                ];
            }));
        }

        function renderGlobals(globals:ValueExceptionGlobals) {
            if (!globals)
                return notice('not available');

            var staticVariables = globals.staticVariables;
            var staticProperties = globals.staticProperties;
            var globalVariables = globals.globalVariables;
            var rows = [];

            for (var i = 0; i < globalVariables.length; i++) {
                var pieces = document.createDocumentFragment();
                var v2 = globalVariables[i];
                var superGlobals = [
                    'GLOBALS',
                    '_SERVER',
                    '_GET',
                    '_POST',
                    '_FILES',
                    '_COOKIE',
                    '_SESSION',
                    '_REQUEST',
                    '_ENV'
                ];
                if (superGlobals.indexOf(v2.name) == -1) {
                    pieces.appendChild(keyword('global'));
                    pieces.appendChild(text(' '));
                }
                pieces.appendChild(renderVariable(v2.name));

                rows.push([pieces, text('='), render(v2.value)]);

            }

            for (var i = 0; i < staticProperties.length; i++) {
                var p = staticProperties[i];
                var pieces = document.createDocumentFragment();
                pieces.appendChild(keyword(p.access));
                pieces.appendChild(text(' '));
                pieces.appendChild(text(p.className + '::'));
                pieces.appendChild(renderVariable(p.name));

                rows.push([pieces, text('='), render(p.value)]);
            }

            for (var i = 0; i < staticVariables.length; i++) {
                var v = staticVariables[i];
                var pieces = document.createDocumentFragment();
                pieces.appendChild(keyword('function'));
                pieces.appendChild(text(' '));

                if (v.className) {
                    pieces.appendChild(text(v.className + '::'));
                }

                pieces.appendChild(text(v.functionName + '()::'));
                pieces.appendChild(renderVariable(v.name));

                rows.push([
                    pieces,
                    text('='),
                    render(v.value)
                ]);
            }

            return createTable(rows);
        }

        function renderException(x:ValueException):Node {
            if (!x)
                return italics('none');

            return inlineBlock(expandable({
                head: collect([keyword('exception'), text(' ' + x.className)]),
                body: function () {
                    function renderInfo() {
                        return createTable([
                            [bold('code'), text(x.code)],
                            [bold('message'), text(x.message)],
                            [bold('location'), renderLocation(x.location, true)],
                            [bold('previous'), renderException(x.previous)]
                        ]);
                    }

                    var parts = collect([
                        block(expandable({open: true, head: bold('exception'), body: renderInfo})),
                        block(expandable({open: true, head: bold('locals'), body: function () {
                            return renderLocals(x.locals);
                        }})),
                        block(expandable({open: true, head: bold('stack'), body: function () {
                            return renderStack(x.stack);
                        }})),
                        block(expandable({open: true, head: bold('globals'), body: function () {
                            return renderGlobals(x.globals);
                        }}))
                    ]);

                    var body = document.createElement('div');
                    body.appendChild(parts);
                    body.style.padding = padding;
                    return body;
                },
                open: true
            }));
        }

        function renderLocation(location:ValueExceptionLocation, open:boolean = false):Node {
            return inlineBlock(expandable({
                head: collect([text(location.file + ':'), renderNumber(location.line)]),
                body: function () {
                    if (!location.source)
                        return notice('no source code');

                    var inner = document.createDocumentFragment();

                    for (var codeLine in location.source) {
                        if (!location.source.hasOwnProperty(codeLine))
                            continue;

                        var lineNumber = wrap(String(codeLine));
                        lineNumber.style.width = '3em';
                        lineNumber.style.paddingRight = padding;
                        lineNumber.style.marginRight = padding;
                        lineNumber.style.textAlign = 'right';
                        lineNumber.style.color = '#999';

                        var code = wrap(location.source[codeLine]);
                        code.style.minWidth = '60em';

                        var row = block(collect([lineNumber, code]));
                        if (codeLine == location.line) {
                            row.style.backgroundColor = '#f99';
                            row.style.color = '#300';
                            row.style.borderRadius = padding;
                            lineNumber.style.color = '#933';
                        }

                        inner.appendChild(row);
                    }

                    var wrapper = block(inner);
                    wrapper.style.padding = padding;
                    wrapper.style.backgroundColor = '#333';
                    wrapper.style.color = '#eee';

                    return  wrapper;
                },
                open: open
            }));
        }

        function renderString(x:string):Node {
            function doRender():Node {
                var span = document.createElement('span');
                span.style.color = '#080';
                span.style.fontWeight = 'bold';
                span.style.display = 'inline-block';

                var translate = {
                    '\\': '\\\\',
                    '$':  '\\$',
                    '\r': '\\r',
                    '\v': '\\v',
                    '\f': '\\f',
                    '"':  '\\"'
                };

                var buffer:string = '"';

                for (var i = 0; i < x.length; i++) {
                    var char:string = x.charAt(i);
                    var code:number = x.charCodeAt(i);

                    if (translate[char] !== undefined) {
                        var escaped = translate[char];
                    } else if ((code < 32 || code > 126) && char !== '\n' && char != '\t') {
                        escaped = '\\x' + (code < 10 ? '0' + code.toString(16) : code.toString(16));
                    } else {
                        escaped = undefined;
                    }

                    if (escaped !== undefined) {
                        if (buffer.length > 0)
                            span.appendChild(document.createTextNode(buffer));

                        buffer = "";
                        span.appendChild(keyword(escaped));
                    } else {
                        buffer += char;
                    }
                }

                span.appendChild(document.createTextNode(buffer + '"'));

                return span;
            }

            var visualLength = 0;

            for (var i = 0; i < x.length; i++) {
                var code = x.charCodeAt(i);
                var isPrintable = code >= 32 && code <= 126;
                visualLength += isPrintable ? 1 : 4;
            }

            if (visualLength > 200 || x.indexOf("\n") != -1) {
                return inlineBlock(expandable({open: false, head: keyword('string'), body: doRender}));
            } else {
                return doRender();
            }
        }

        function renderNumber(x:number, float:boolean = false):Node {
            if (isNaN(x))
                return keyword('NAN');
            else if (x == Infinity)
                return keyword('INF');
            else if (x == -Infinity)
                return collect([text('-'), keyword('INF')]);

            var result = wrap(float && x % 1 == 0 ? String(x) + '.0' : String(x));
            result.style.color = '#00f';
            return result;
        }

        return v.acceptVisitor({
            visitString:    renderString,
            visitBool:      function (x:boolean) { return keyword(x ? 'true' : 'false'); },
            visitNull:      function () { return keyword('null'); },
            visitUnknown:   function () { return bold('unknown type'); },
            visitInt:       renderNumber,
            visitFloat:     function (x:number) { return renderNumber(x, true); },
            visitResource:  function (type:string) { return collect([keyword('resource'), text(' ' + type)]); },
            visitObject:    renderObject,
            visitArray:     renderArray,
            visitException: renderException
        });
    }

    export function renderJSON(json:string) {
        var container = document.createElement('div');
        container.style.whiteSpace = 'pre';
        container.style.fontFamily = fontFamily;
        container.style.fontSize = fontSize;
        container.appendChild(render(parse(json)));
        return container;
    }

    export function UI() {
        var text = document.createElement('textarea');
        text.style.display = 'block';
        text.style.width = '100%';
        text.style.height = '40em';
        text.style.margin = '0';
        text.style.padding = '0';
        text.style.marginTop = '1em';
        text.style.boxSizing = 'border-box';
        text.style['MozBoxSizing'] = 'border-box';
        text.style.fontFamily = fontFamily;
        text.style.fontSize = fontSize;
        text.style.whiteSpace = 'pre';
        text.style.border = 'none';
        text.style.wordWrap = 'normal';

        var container = document.createElement('div');

        function onchange() {
            text.value = JSON.stringify(JSON.parse(text.value), undefined, 4);
            container.innerHTML = '';
            container.appendChild(renderJSON(text.value));
        }

        text.addEventListener('change', onchange);

        text.value = "{\"root\":[\"exception\",{\"class\":\"MuhMockException\",\"code\":\"Dummy exception code\",\"message\":\"This is a dummy exception message.\\n\\nlololool\",\"location\":{\"line\":9000,\"file\":\"\\/path\\/to\\/muh\\/file\",\"sourceCode\":null},\"previous\":null,\"stack\":[{\"function\":\"aFunction\",\"class\":\"DummyClass1\",\"isStatic\":null,\"location\":{\"line\":1928,\"file\":\"\\/path\\/to\\/muh\\/file\",\"sourceCode\":null},\"object\":[\"object\",0],\"args\":[[\"object\",1]]},{\"function\":\"aFunction\",\"class\":null,\"isStatic\":null,\"location\":{\"line\":1928,\"file\":\"\\/path\\/to\\/muh\\/file\",\"sourceCode\":null},\"object\":null,\"args\":[[\"object\",2]]}],\"locals\":[{\"name\":\"lol\",\"value\":8},{\"name\":\"foo\",\"value\":\"bar\"}],\"globals\":{\"staticProperties\":[{\"name\":\"blahProperty\",\"value\":null,\"class\":\"BlahClass\",\"access\":\"private\",\"isDefault\":false}],\"globalVariables\":[{\"name\":\"lol global\",\"value\":null},{\"name\":\"blahVariable\",\"value\":null}],\"staticVariables\":[{\"name\":\"public\",\"value\":null,\"class\":null,\"function\":\"BlahAnotherClass\"},{\"name\":\"lolStatic\",\"value\":null,\"class\":\"BlahYetAnotherClass\",\"function\":\"blahMethod\"}]}}],\"arrays\":[],\"objects\":[{\"class\":\"ErrorHandler\\\\DummyClass1\",\"hash\":\"0000000058b5388000000000367cf886\",\"properties\":[{\"name\":\"private1\",\"value\":null,\"class\":\"ErrorHandler\\\\DummyClass1\",\"access\":\"private\",\"isDefault\":true},{\"name\":\"protected1\",\"value\":null,\"class\":\"ErrorHandler\\\\DummyClass1\",\"access\":\"protected\",\"isDefault\":true},{\"name\":\"public1\",\"value\":null,\"class\":\"ErrorHandler\\\\DummyClass1\",\"access\":\"public\",\"isDefault\":true}]},{\"class\":\"ErrorHandler\\\\DummyClass2\",\"hash\":\"0000000058b5388300000000367cf886\",\"properties\":[{\"name\":\"private2\",\"value\":null,\"class\":\"ErrorHandler\\\\DummyClass2\",\"access\":\"private\",\"isDefault\":true},{\"name\":\"protected2\",\"value\":null,\"class\":\"ErrorHandler\\\\DummyClass2\",\"access\":\"protected\",\"isDefault\":true},{\"name\":\"public2\",\"value\":null,\"class\":\"ErrorHandler\\\\DummyClass2\",\"access\":\"public\",\"isDefault\":true},{\"name\":\"private1\",\"value\":null,\"class\":\"ErrorHandler\\\\DummyClass1\",\"access\":\"private\",\"isDefault\":true},{\"name\":\"protected1\",\"value\":null,\"class\":\"ErrorHandler\\\\DummyClass1\",\"access\":\"protected\",\"isDefault\":true},{\"name\":\"public1\",\"value\":null,\"class\":\"ErrorHandler\\\\DummyClass1\",\"access\":\"public\",\"isDefault\":true}]},{\"class\":\"ErrorHandler\\\\DummyClass2\",\"hash\":\"0000000058b5388a00000000367cf886\",\"properties\":[{\"name\":\"private2\",\"value\":null,\"class\":\"ErrorHandler\\\\DummyClass2\",\"access\":\"private\",\"isDefault\":true},{\"name\":\"protected2\",\"value\":null,\"class\":\"ErrorHandler\\\\DummyClass2\",\"access\":\"protected\",\"isDefault\":true},{\"name\":\"public2\",\"value\":null,\"class\":\"ErrorHandler\\\\DummyClass2\",\"access\":\"public\",\"isDefault\":true},{\"name\":\"private1\",\"value\":null,\"class\":\"ErrorHandler\\\\DummyClass1\",\"access\":\"private\",\"isDefault\":true},{\"name\":\"protected1\",\"value\":null,\"class\":\"ErrorHandler\\\\DummyClass1\",\"access\":\"protected\",\"isDefault\":true},{\"name\":\"public1\",\"value\":null,\"class\":\"ErrorHandler\\\\DummyClass1\",\"access\":\"public\",\"isDefault\":true}]}]}";
        onchange();

        var body = document.createDocumentFragment();
        body.appendChild(container);
        body.appendChild(text);
        return body;
    }
}
