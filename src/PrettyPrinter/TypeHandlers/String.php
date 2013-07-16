<?php

namespace PrettyPrinter\TypeHandlers;

use PrettyPrinter\CachingTypeHandler;
use PrettyPrinter\Utils\Text;
use PrettyPrinter\TypeHandlers\Any;

final class String extends CachingTypeHandler
{
	private $characterEscapeCache = array( "\\" => '\\\\',
	                                       "\$" => '\$',
	                                       "\r" => '\r',
	                                       "\v" => '\v',
	                                       "\f" => '\f',
	                                       "\"" => '\"' );

	function __construct( Any $valueHandler )
	{
		parent::__construct( $valueHandler );

		$settings = $this->settings();

		$this->characterEscapeCache[ "\t" ] = $settings->escapeTabsInStrings()->get() ? '\t' : "\t";
		$this->characterEscapeCache[ "\n" ] = $settings->splitMultiLineStrings()->get() ? "\\n\" .\n\"" : '\n';
	}

	protected function handleCacheMiss( $string )
	{
		$escaped   = '';
		$length    = strlen( $string );
		$maxLength = $this->settings()->maxStringLength()->get();

		for ( $i = 0; $i < $length && $i < $maxLength; $i++ )
		{
			$char        = $string[ $i ];
			$charEscaped =& $this->characterEscapeCache[ $char ];

			if ( !isset( $charEscaped ) )
			{
				$ord         = ord( $char );
				$charEscaped = $ord >= 32 && $ord <= 126 ? $char : '\x' . substr( '00' . dechex( $ord ), -2 );
			}

			$escaped .= $charEscaped;
		}

		return new Text( "\"$escaped" . ( $i === $length ? "\"" : "..." ) );
	}
}

