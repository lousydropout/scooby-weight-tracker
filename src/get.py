import json
from datetime import datetime
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

    return result


def handler(event: dict, context):
    print("Event: ", json.dumps(event))

    name = event["pathParameters"]["name"]
    params = get_query_params(event)
    results = get_items(name, params)

    return {"statusCode": 200, "body": json.dumps({"results": results}, default=str)}
