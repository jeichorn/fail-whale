<?php

namespace ErrorHandler;

final class PrettyPrinter implements ValueVisitor {
    private $escapeTabsInStrings = false;
    private $maxArrayEntries = INF;
    private $maxObjectProperties = INF;
    private $maxStringLength = INF;
    private $showExceptionGlobalVariables = true;
    private $showExceptionLocalVariables = true;
    private $showExceptionStackTrace = true;
    private $splitMultiLineStrings = true;
    private $showExceptionSourceCode = true;
    private $arraysRendered = array();
    private $objectsRendered = array();

    function text($text = '') { return new PrettyPrinterText($text, "\n"); }

    function assertPrettyIs($value, $expectedPretty) {
        $this->assertPrettyRefIs($value, $expectedPretty);
    }

    function assertPrettyRefIs(&$ref, $expectedPretty) {
        \PHPUnit_Framework_TestCase::assertEquals($expectedPretty, $this->prettyPrintRef($ref));
    }

    function prettyPrint($value) {
        return $this->prettyPrintRef($value);
    }

    function prettyPrintException(\Exception $e) {
        $i = new Introspection;

        return $this->render(JSONValue::fromValue($i->introspectException($e)))->toString();
    }

    function prettyPrintRef(&$ref) {
        $this->arraysRendered  = array();
        $this->objectsRendered = array();

        $i = new Introspection;

        return $this->render(JSONValue::fromValue($i->introspectRef($ref)))->toString();
    }

    /**
     * @param Value $v
     *
     * @return PrettyPrinterText
     */
    function render(Value $v) { return $v->acceptVisitor($this); }

    function visitArray(ValueArray $array) {
        $rendered =& $this->arraysRendered[$array->id()];

        if ($rendered)
            return $this->text('*recursion*');

        $rendered = true;

        $entries       = $array->entries();
        $isAssociative = $array->isAssociative();

        if ($entries === array())
            return $this->text("array()");

        $rows = array();

        foreach ($entries as $keyValuePair) {
            if ((count($rows) + 1) > $this->maxArrayEntries)
                break;

            $key   = $this->render($keyValuePair->key());
            $value = $this->render($keyValuePair->value());

            if (count($rows) != count($entries) - 1)
                $value->append(',');

            $rows[] = $isAssociative
                ? array($key, $value->prepend(' => '))
                : array($value);
        }

        $rendered = false;

        $result = $this->renderTable($rows);

        if (count($rows) < count($entries))
            $result->addLine('...');

        return $result->setHasEndingNewline(false)->wrap("array( ", " )");
    }

    /**
     * @param ValueException $e
     *
     * @return PrettyPrinterText
     */
    private function renderException(ValueException $e) {
        $location = $e->location();

        $text = $this->text("{$e->className()} {$e->code()} in {$location->file()}:{$location->line()}\n");
        $text->addLine();
        $text->addLines($this->text($e->message())->indent(2));
        $text->addLine();

        if ($this->showExceptionSourceCode) {
            $sourceCode = $location->sourceCode();

            $t = $sourceCode === null ? 'not available' : $this->renderSourceCode($sourceCode, $location->line());

            $text->addLine("source code:");
            $text->addLines($t->indent());
            $text->addLine();
        }

        if ($this->showExceptionLocalVariables) {
            $locals = $e->locals();

            if ($locals === null) {
                $t = $this->text('not available');
            } else {
                $prefixes = array_fill(0, count($locals), '');
                $t        = $this->renderVariables($locals, 'none', INF, $prefixes);
            }

            $text->addLine("local variables:");
            $text->addLines($t->indent());
            $text->addLine();
        }

        if ($this->showExceptionStackTrace) {
            $text->addLine("stack trace:");
            $text->addLines($this->renderExceptionStack($e)->indent());
            $text->addLine();
        }

        $previous = $e->previous() === null ? $this->text('none') : $this->renderException($e->previous());

        $text->addLine("previous exception:");
        $text->addLines($previous->indent(2));
        $text->addLine();

        return $text;
    }

    /**
     * @param string[] $code
     * @param int      $line
     *
     * @return PrettyPrinterText
     */
    private function renderSourceCode($code, $line) {
        $rows = array();

        foreach ($code as $codeLine => $codeText) {
            $rows[] = array($this->text($codeLine == $line ? "> " : ''),
                            $this->text("$codeLine "),
                            $this->text($codeText));
        }

        return $this->renderTable($rows);
    }

    /**
     * @param ValueVariable[] $variables
     * @param string          $noneText
     * @param float           $max
     * @param string[]        $prefixes
     *
     * @return PrettyPrinterText
     */
    private function renderVariables(array $variables, $noneText, $max, array $prefixes) {
        if (count($variables) == 0)
            return $this->text($noneText);

        $rows = array();

        foreach ($variables as $k => $variable) {
            if ((count($rows) + 1) > $max)
                break;

            $rows[] = array(
                $this->text($prefixes[$k])->appendLines($this->renderVariable($variable->name())),
                $this->render($variable->value())->wrap(' = ', ';'),
            );
        }

        $result = $this->renderTable($rows);

        if (count($rows) < count($variables))
            $result->addLine('...');

        return $result;
    }

    private function renderExceptionStack(ValueException $exception) {
        $text = $this->text();
        $i    = 1;

        foreach ($exception->stack() as $frame) {
            $location = $frame->getLocation();
            $location = $location === null ? '[internal function]' : "{$location->file()}:{$location->line()}";
            $text->addLine("#$i {$location}");
            $text->addLines($this->renderExceptionStackFrame($frame)->append(';')->indent(3));
            $text->addLine();
            $i++;
        }

        return $text->addLine("#$i {main}");
    }

    private function renderExceptionStackFrame(ValueExceptionStackFrame $frame) {
        $prefix = $this->renderExceptionStackFramePrefix($frame);
        $args   = $this->renderExceptionStackFrameArgs($frame);

        return $prefix->append($frame->getFunction())->appendLines($args);
    }

    function visitException(ValueException $exception) {
        $text = $this->renderException($exception);

        if ($this->showExceptionGlobalVariables) {
            $globals = $exception->globals();

            if ($globals !== null) {
                $superGlobals = array(
                    '_POST',
                    '_GET',
                    '_SESSION',
                    '_COOKIE',
                    '_FILES',
                    '_REQUEST',
                    '_ENV',
                    '_SERVER',
                );

                $variables = array();
                $prefixes  = array();

                foreach ($globals->getStaticProperties() as $p) {
                    $variables[] = $p;
                    $prefixes[]  = "{$p->access()} static {$p->className()}::";
                }

                foreach ($globals->getStaticVariables() as $p) {
                    $class       = $p->getClass();
                    $function    = $p->getFunction();
                    $function    = $class === null ? $function : "$class::$function";
                    $prefixes[]  = "function $function()::static ";
                    $variables[] = $p;
                }

                foreach ($globals->getGlobalVariables() as $v) {
                    $variables[] = $v;
                    $prefixes[]  = in_array($v->name(), $superGlobals) ? '' : 'global ';
                }

                $t = $this->renderVariables($variables, 'none', INF, $prefixes);
            } else {
                $t = $this->text('not available');
            }

            $text->addLine("global variables:");
            $text->addLines($t->indent());
            $text->addLine();
        }

        return $text;
    }

    function visitObject(ValueObject $object) {
        $rendered =& $this->objectsRendered[$object->id()];

        if ($rendered)
            return $this->text('*recursion*');

        $rendered = true;

        $properties = $object->properties();
        $class      = $object->className();

        if ($properties === array()) {
            $result = $this->text("new $class {}");
        } elseif ($this->maxObjectProperties == 0) {
            $result = $this->text("new $class {...}");
        } else {
            $prefixes = array();

            foreach ($properties as $prop) {
                $prefixes[] = "{$prop->access()} ";
            }

            $result = $this->renderVariables($properties, '', $this->maxObjectProperties, $prefixes)
                           ->setHasEndingNewline(false)
                           ->indent(2)->wrapLines("new $class {", "}");
        }

        $rendered = false;

        return $result;
    }

    /**
     * @param string $string
     *
     * @return PrettyPrinterText
     */
    private function renderString($string) {
        $characterEscapeCache = array(
            "\\" => '\\\\',
            "\$" => '\$',
            "\r" => '\r',
            "\v" => '\v',
            "\f" => '\f',
            "\"" => '\"',
            "\t" => $this->escapeTabsInStrings ? '\t' : "\t",
            "\n" => $this->splitMultiLineStrings ? "\\n\" .\n\"" : '\n',
        );

        $escaped = '';
        $length  = min(strlen($string), $this->maxStringLength);

        for ($i = 0; $i < $length; $i++) {
            $char        = $string[$i];
            $charEscaped =& $characterEscapeCache[$char];

            if (!isset($charEscaped)) {
                $ord         = ord($char);
                $charEscaped = $ord >= 32 && $ord <= 126 ? $char : '\x' . substr('00' . dechex($ord), -2);
            }

            $escaped .= $charEscaped;
        }

        return $this->text("\"$escaped" . (strlen($string) > $length ? '...' : '"'));
    }

    /**
     * @param string $name
     *
     * @return PrettyPrinterText
     */
    private function renderVariable($name) {
        if (preg_match("/^[a-zA-Z_\x7f-\xff][a-zA-Z0-9_\x7f-\xff]*$/", $name))
            return $this->text("$$name");
        else
            return $this->renderString($name)->wrap('${', '}');
    }

    function setEscapeTabsInStrings($escapeTabsInStrings) {
        $this->escapeTabsInStrings = (bool)$escapeTabsInStrings;
    }

    function setMaxArrayEntries($maxArrayEntries) {
        $this->maxArrayEntries = (float)$maxArrayEntries;
    }

    function setMaxObjectProperties($maxObjectProperties) {
        $this->maxObjectProperties = (float)$maxObjectProperties;
    }

    function setMaxStringLength($maxStringLength) {
        $this->maxStringLength = (float)$maxStringLength;
    }

    function setShowExceptionGlobalVariables($showExceptionGlobalVariables) {
        $this->showExceptionGlobalVariables = (bool)$showExceptionGlobalVariables;
    }

    function setShowExceptionLocalVariables($showExceptionLocalVariables) {
        $this->showExceptionLocalVariables = (bool)$showExceptionLocalVariables;
    }

    function setShowExceptionStackTrace($showExceptionStackTrace) {
        $this->showExceptionStackTrace = (bool)$showExceptionStackTrace;
    }

    function setShowExceptionSourceCode($showExceptionSourceCode) {
        $this->showExceptionSourceCode = (bool)$showExceptionSourceCode;
    }

    function setSplitMultiLineStrings($splitMultiLineStrings) {
        $this->splitMultiLineStrings = (bool)$splitMultiLineStrings;
    }

    private function renderTable($rows) {
        return PrettyPrinterText::renderTable($rows, "\n");
    }

    function visitString(ValueString $s) {
        return $this->renderString($s->string());
    }

    function visitInt($int) {
        return $this->text("$int");
    }

    function visitNull() {
        return $this->text('null');
    }

    function visitUnknown() {
        return $this->text('unknown type');
    }

    function visitFloat($float) {
        $int = (int)$float;

        return $this->text("$int" === "$float" ? "$float.0" : "$float");
    }

    function visitResource(ValueResource $r) {
        return $this->text("{$r->resourceType()}");
    }

    function visitBool($bool) {
        return $this->text($bool ? 'true' : 'false');
    }

    private function renderExceptionStackFrameArgs(ValueExceptionStackFrame $frame) {
        $args = $frame->getArgs();

        if ($args === null)
            return $this->text("( ? )");

        if ($args === array())
            return $this->text("()");

        $pretties    = array();
        $isMultiLine = false;

        foreach ($args as $arg) {
            $pretty      = $this->render($arg);
            $isMultiLine = $isMultiLine || $pretty->count() > 1;
            $pretties[]  = $pretty;
        }

        $result = $this->text();

        foreach ($pretties as $k => $pretty) {
            if ($k !== 0)
                $result->append(', ');

            if ($isMultiLine)
                $result->addLines($pretty);
            else
                $result->appendLines($pretty);
        }

        return $result->wrap("( ", " )");
    }

    private function renderExceptionStackFramePrefix(ValueExceptionStackFrame $frame) {
        if ($frame->getObject() !== null)
            return $this->visitObject($frame->getObject())->append('->');
        else if ($frame->getClass() !== null)
            return $this->text($frame->getClass() . ($frame->getIsStatic() ? "::" : "->"));
        else
            return $this->text();
    }
}

class PrettyPrinterText {
    /**
     * @param array  $rows
     * @param string $newLineChar
     *
     * @return self
     */
    static function renderTable(array $rows, $newLineChar) {
        $columnWidths = array();

        /** @var $cell self */
        foreach (self::flipArray($rows) as $colNo => $column) {
            $width = 0;

            foreach ($column as $cell) {
                $width = max($width, $cell->width());
            }

            $columnWidths[$colNo] = $width;
        }

        $result = new self('', $newLineChar);

        foreach ($rows as $cells) {
            $row        = new self('', $newLineChar);
            $lastColumn = count($cells) - 1;

            foreach ($cells as $column => $cell) {
                $cell = clone $cell;

                if ($column !== $lastColumn) {
                    $cell->padWidth($columnWidths[$column]);
                }

                $row->appendLines($cell);
            }

            $result->addLines($row);
        }

        return $result;
    }

    private static function flipArray(array $x) {
        $result = array();

        foreach ($x as $k1 => $v1) {
            foreach ($v1 as $k2 => $v2) {
                $result[$k2][$k1] = $v2;
            }
        }

        return $result;
    }

    private $lines, $hasEndingNewLine, $newLineChar;

    function __construct($text, $newLineChar) {
        $this->newLineChar = $newLineChar;
        $this->lines       = explode($this->newLineChar, $text);

        if ($this->hasEndingNewLine = $this->lines[count($this->lines) - 1] === "") {
            array_pop($this->lines);
        }
    }

    function toString() {
        $text = join($this->newLineChar, $this->lines);

        if ($this->hasEndingNewLine && $this->lines) {
            $text .= $this->newLineChar;
        }

        return $text;
    }

    /**
     * @param string $line
     *
     * @return self
     */
    function addLine($line = "") {
        return $this->addLines($this->text($line . $this->newLineChar));
    }

    /**
     * @param self $add
     *
     * @return self
     */
    function addLines(self $add) {
        foreach ($add->lines as $line) {
            $this->lines[] = $line;
        }

        return $this;
    }

    function addLinesBefore(self $addBefore) {
        return $this->addLines($this->swapLines($addBefore));
    }

    function append($string) {
        return $this->appendLines($this->text($string));
    }

    /**
     * @param self $append
     *
     * @return self
     */
    function appendLines(self $append) {
        $space = str_repeat(' ', $this->width());

        foreach ($append->lines as $k => $line) {
            if ($k === 0 && $this->lines) {
                $this->lines[count($this->lines) - 1] .= $line;
            } else {
                $this->lines[] = $space . $line;
            }
        }

        return $this;
    }

    function count() { return count($this->lines); }

    /**
     * @param int $times
     *
     * @return self
     */
    function indent($times = 1) {
        $space = str_repeat('  ', $times);

        foreach ($this->lines as $k => $line) {
            if ($line !== '') {
                $this->lines[$k] = $space . $line;
            }
        }

        return $this;
    }

    function padWidth($width) {
        return $this->append(str_repeat(' ', $width - $this->width()));
    }

    /**
     * @param $string
     *
     * @return self
     */
    function prepend($string) {
        return $this->prependLines($this->text($string));
    }

    function prependLine($line = "") {
        return $this->addLines($this->swapLines($this->text($line . $this->newLineChar)));
    }

    function prependLines(self $lines) {
        return $this->appendLines($this->swapLines($lines));
    }

    /**
     * @param $value
     *
     * @return self
     */
    function setHasEndingNewline($value) {
        $this->hasEndingNewLine = (bool)$value;

        return $this;
    }

    function swapLines(self $other) {
        $clone       = clone $this;
        $this->lines = $other->lines;

        return $clone;
    }

    function width() {
        return $this->lines ? strlen($this->lines[count($this->lines) - 1]) : 0;
    }

    function wrap($prepend, $append) {
        return $this->prepend($prepend)->append($append);
    }

    function wrapLines($prepend = '', $append = '') {
        return $this->prependLine($prepend)->addLine($append);
    }

    private function text($text) {
        return new self($text, $this->newLineChar);
    }
}
