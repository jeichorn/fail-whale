<?php

namespace ErrorHandler;

abstract class Value implements JSONSerializable {
    private static $nextID = 0;

    static function introspect(Introspection $i, &$x) {
        if (is_string($x))
            return new ValueString($x);
        else if (is_int($x))
            return new ValueInt($x);
        else if (is_bool($x))
            return new ValueBool($x);
        else if (is_null($x))
            return new ValueNull;
        else if (is_float($x))
            return new ValueFloat($x);
        else if (is_array($x))
            return ValueArray::introspect($i, $x);
        else if (is_object($x))
            return ValueObject::introspect($i, $x);
        else if (is_resource($x))
            return ValueResource::introspect($i, $x);
        else
            return new ValueUnknown;
    }

    static function fromJSON(JSONUnserialize $s, $v) {
        if (is_float($v))
            return new ValueFloat($v);

        if (is_int($v))
            return new ValueInt($v);

        if (is_bool($v))
            return new ValueBool($v);

        if (is_null($v))
            return new ValueNull;

        if (is_string($v))
            return new ValueString($v);

        switch ($v[0]) {
            case 'object':
                return ValueObject::fromJSON($s, $v);
            case '-inf':
            case '+inf':
            case 'nan':
            case 'float':
                return ValueFloat::fromJSON($s, $v);
            case 'array':
                return ValueArray::fromJSON($s, $v);
            case 'exception':
                return ValueException::fromJSON($s, $v);
            case 'resource':
                return ValueResource::fromJSON($s, $v);
            case 'unknown':
                return new ValueUnknown;
            case 'null':
                return new ValueNull;
            case 'int':
                return new ValueInt($v[1]);
            case 'bool':
                return new ValueBool($v[1]);
            case 'string':
                return new ValueString($v[1]);
            default:
                throw new Exception("Unknown type: {$v[0]}");
        }
    }

    private $id;

    protected function __construct() {
        $this->id = self::$nextID++;
    }

    function __clone() {
        $this->id = self::$nextID++;
    }

    function toJsonFromJson() {
        $json  = JSONSerialize::toJson($this);
        $json  = JSON::parse(JSON::stringify($json));
        $value = JSONUnserialize::fromJSON($json);

        return $value;
    }

    /**
     * @param PrettyPrinter $settings
     *
     * @return PrettyPrinterText
     */
    final function render(PrettyPrinter $settings) { return $settings->render($this); }

    function id() { return $this->id; }

    /**
     * @param PrettyPrinter $settings
     *
     * @return PrettyPrinterText
     */
    abstract function renderImpl(PrettyPrinter $settings);

    /**
     * @return self[]
     */
    function subValues() { return array(); }
}

class ValueBool extends Value {
    private $bool;

    function __construct($x) {
        assert(is_bool($x));

        $this->bool = $x;
    }

    function renderImpl(PrettyPrinter $settings) { return $settings->text($this->bool ? 'true' : 'false'); }

    function toJSON(JSONSerialize $s) { return $this->bool; }
}

class ValueFloat extends Value {
    /**
     * @param JSONUnserialize $s
     * @param mixed                    $x2
     *
     * @return self
     */
    static function fromJSON(JSONUnserialize $s, $x2) {
        $x = $x2[1];
        if ($x === '+inf')
            $result = INF;
        else if ($x === '-inf')
            $result = -INF;
        else if ($x === 'nan')
            $result = NAN;
        else
            $result = (float)$x;

        return new self($result);
    }

    private $float;

    function __construct($x) {
        assert(is_float($x));

        $this->float = $x;
    }

    function renderImpl(PrettyPrinter $settings) {
        $int = (int)$this->float;

        return $settings->text("$int" === "$this->float" ? "$this->float.0" : "$this->float");
    }

    function toJSON(JSONSerialize $s) {
        $result = $this->float;

        if ($result === INF)
            $float = '+inf';
        else if ($result === -INF)
            $float = '-inf';
        else if (is_nan($result))
            $float = 'nan';
        else
            $float = $result;

        return array('float', $float);
    }
}

class ValueInt extends Value {
    private $int;

    function __construct($x) {
        assert(is_int($x));

        $this->int = $x;
    }

    function renderImpl(PrettyPrinter $settings) { return $settings->text("$this->int"); }

    function toJSON(JSONSerialize $s) { return $this->int; }
}

class ValueNull extends Value {
    function __construct() { parent::__construct(); }

    function renderImpl(PrettyPrinter $settings) { return $settings->text('null'); }

    function toJSON(JSONSerialize $s) { return null; }
}

class ValueResource extends Value {
    static function introspect(Introspection $i, &$x) {
        $self       = new self;
        $self->type = get_resource_type($x);
        $self->id   = (int)$x;

        return $self;
    }

    static function fromJSON(JSONUnserialize $s, $x) {
        $self = new self;
        $self->schema()->fromJSON($s, $x[1]);

        return $self;
    }

    private $type;
    private $id;

    function renderImpl(PrettyPrinter $settings) {
        return $settings->text($this->type);
    }

    function toJSON(JSONSerialize $s) {
        return array('resource', $this->schema()->toJSON($s));
    }

    private function schema() {
        $schema = new JSONSchema;
        $schema->bind('type', $this->type);
        $schema->bind('id', $this->id);

        return $schema;
    }
}

class ValueString extends Value {
    private $string;

    function __construct($x) {
        assert(is_string($x));

        $this->string = $x;
    }

    function renderImpl(PrettyPrinter $settings) { return $settings->renderString($this->string); }

    function toJSON(JSONSerialize $s) { return $this->string; }
}

class ValueUnknown extends Value {
    function __construct() { parent::__construct(); }

    function renderImpl(PrettyPrinter $settings) {
        return $settings->text('unknown type');
    }

    function toJSON(JSONSerialize $s) { return array('unknown'); }
}


