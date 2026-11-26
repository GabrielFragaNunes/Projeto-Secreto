from decimal import Decimal
from typing import Annotated

from pydantic import BeforeValidator


def parse_json_decimal(value: object) -> object:
    if type(value) is int or type(value) is float:
        converted = Decimal(str(value))
        if not converted.is_finite():
            raise ValueError("o valor decimal deve ser finito")
        return converted
    return value


StrictDecimal = Annotated[Decimal, BeforeValidator(parse_json_decimal)]
