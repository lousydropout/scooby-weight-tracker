import json
from decimal import Decimal
from datetime import datetime
import boto3

dynamodb = boto3.resource("dynamodb")
SCOOBY_TABLE = dynamodb.Table("ScoobyTable")


def put_item(name: str, weight: float, timestamp: str):
    item = {
        "name": name,
        "datetime": timestamp,
        "weight": Decimal.from_float(weight),
    }
    print("Item: ", item)

    response = SCOOBY_TABLE.put_item(Item=item)

    print("response: ", response)


def handler(event: dict, context):
    print("Event: ", json.dumps(event))

    # get weight
    name = event["pathParameters"]["name"]
    query_params = event["queryStringParameters"]
    weight = None
    for k, v in query_params.items():
        if k.lower() == "weight":
            weight = float(v)
            break

    # get timestamp
    timestamp = datetime.utcnow().isoformat()

    # put item
    put_item(name=name, weight=weight, timestamp=timestamp)

    return {
        "statusCode": 200,
        "body": json.dumps({"name": name, "weight": weight, "timestamp": timestamp}),
    }
