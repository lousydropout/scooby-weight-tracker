import json
from datetime import datetime, timedelta
from helpers import dynamodb
import boto3

client = boto3.client("dynamodb")
TABLE_NAME = "ScoobyTable"


def get_items(name: str, params: dict) -> list[dict]:
    # from clause
    from_ = params["from"]
    from_clause = (
        f"datetime >= '{from_}'" if params["inclusive"] else f"datetime > '{from_}'"
    )

    # to clause
    to_ = params["to"]
    to_clause = f"datetime <= '{to_}'"

    # partiql statement
    statement = f"""
    SELECT datetime, weight
    FROM {TABLE_NAME}
    WHERE "name"='{name}' AND {from_clause} AND {to_clause};
    """

    # query response
    response = client.execute_statement(Statement=statement)
    print("response: ", response)
    return [dynamodb.from_(x) for x in response["Items"]]


def get_query_params(event: dict) -> dict[str, str | int | bool]:
    # default params
    result = {
        "from": "2023-06-01T00:00:00",
        "to": datetime.utcnow().isoformat(),
        "limit": 1000,
        "inclusive": True,
        "timezone_offset": 0,
    }

    # update params
    params = event.get("queryStringParameters") or {}
    for k, v in params.items():
        if k.lower() in {"from", "to"}:
            result[k.lower()] = v
        elif k.lower() == "limit":
            result["limit"] = int(v)
        elif k.lower() == "inclusive":
            result["inclusive"] = v.lower() != "false"
        elif k.lower() == "timezone_offset":
            result["timezone_offset"] = int(v)

    return result


def shift_dt(time: str, shift: int) -> str:
    x = datetime.fromisoformat(time)
    y = x - timedelta(hours=shift)
    return y.isoformat()


def handler(event: dict, context) -> dict[str, str]:
    print("Event: ", json.dumps(event))

    name = event["pathParameters"]["name"]
    params = get_query_params(event)
    timezone_offset = params["timezone_offset"]
    results = get_items(name, params)

    return {
        "statusCode": 200,
        "headers": {"content-type": "application/json"},
        "body": json.dumps(
            {
                "results": [
                    (shift_dt(x["datetime"], timezone_offset), x["weight"])
                    for x in results
                ]
            },
            default=str,
        ),
    }
