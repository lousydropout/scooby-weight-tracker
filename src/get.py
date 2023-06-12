import json
from decimal import Decimal
from datetime import datetime
import boto3

dynamodb = boto3.resource("dynamodb")
SCOOBY_TABLE = dynamodb.Table("ScoobyTable")


def put_item():
    item = {
        "name": "test",
        "datetime": datetime.utcnow().isoformat(),
        "weight": Decimal.from_float(100.4),
    }
    print("Item: ", item)

    response = SCOOBY_TABLE.put_item(Item=item)

    print("response: ", response)


def handler(event: dict, context):
    print("Event: ", json.dumps(event))

    name = event["pathParameters"]["name"]

    return {"statusCode": 200, "body": f"Hi, from GET /{name}"}
