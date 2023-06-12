import json
from decimal import Decimal
from datetime import datetime
import boto3

dynamodb = boto3.resource("dynamodb")
SCOOBY_TABLE = dynamodb.Table("ScoobyTable")


def bad_response(status_code: int, message: str) -> dict[str, str]:
    return {
        "statusCode": status_code,
        "body": json.dumps({"message": message}),
    }


def put_item(name: str, weight: str, timestamp: str):
    item = {
        "name": name,
        "datetime": timestamp,
        "weight": Decimal(weight),
    }
    print("Item: ", json.dumps(item, default=str))

    response = SCOOBY_TABLE.put_item(Item=item)
    print("response: ", json.dumps(response, default=str))


def handler(event: dict, context) -> dict[str, str]:
    print("Event: ", json.dumps(event))

    # get weight
    name = event["pathParameters"]["name"]
    query_params = event["queryStringParameters"]
    weight = query_params.get("weight")
    try:
        float(weight)
    except:
        return bad_response(
            status_code=400,
            message="A valid query param 'weight' is required.",
        )

    # get timestamp
    timestamp = datetime.utcnow().isoformat()

    # put item
    put_item(name=name, weight=weight, timestamp=timestamp)

    return {
        "statusCode": 200,
        "headers": {"content-type": "application/json"},
        "body": json.dumps({"name": name, "weight": weight, "timestamp": timestamp}),
    }
