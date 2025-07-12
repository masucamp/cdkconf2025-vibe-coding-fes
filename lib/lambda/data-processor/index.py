"""
Data Processor Lambda Function
Processes data from Kinesis and writes to Timestream and Neptune
"""

import json
import boto3
import os
from datetime import datetime
import logging
from typing import Dict, List, Any
import base64

# Configure logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Initialize AWS clients
timestream_client = boto3.client('timestream-write')
s3_client = boto3.client('s3')


def handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Main handler function for processing Kinesis records
    
    Args:
        event: Kinesis event containing records
        context: Lambda context
        
    Returns:
        Response dictionary with status and message
    """
    try:
        processed_count = 0
        failed_count = 0
        
        for record in event.get('Records', []):
            try:
                # Decode Kinesis data
                payload = decode_kinesis_record(record)
                
                # Process the payload
                process_record(payload, record.get('kinesis', {}).get('sequenceNumber'))
                processed_count += 1
                
            except Exception as e:
                logger.error(f"Error processing individual record: {str(e)}")
                failed_count += 1
                continue
        
        logger.info(f"Processed {processed_count} records successfully, {failed_count} failed")
        
        return {
            'statusCode': 200,
            'body': json.dumps({
                'message': 'Successfully processed records',
                'processed': processed_count,
                'failed': failed_count
            })
        }
        
    except Exception as e:
        logger.error(f"Error processing batch: {str(e)}")
        raise


def decode_kinesis_record(record: Dict[str, Any]) -> Dict[str, Any]:
    """
    Decode Kinesis record data
    
    Args:
        record: Kinesis record
        
    Returns:
        Decoded payload as dictionary
    """
    kinesis_data = record.get('kinesis', {})
    encoded_data = kinesis_data.get('data', '')
    
    # Decode base64 data
    decoded_data = base64.b64decode(encoded_data).decode('utf-8')
    
    return json.loads(decoded_data)


def process_record(payload: Dict[str, Any], sequence_number: str) -> None:
    """
    Process a single record by writing to Timestream and archiving to S3
    
    Args:
        payload: Decoded record payload
        sequence_number: Kinesis sequence number
    """
    # Write time-series data to Timestream
    if payload.get('metrics'):
        write_to_timestream(payload)
    
    # Archive raw data to S3
    archive_to_s3(payload, sequence_number)
    
    # TODO: Write graph data to Neptune
    # write_to_neptune(payload)


def write_to_timestream(data: Dict[str, Any]) -> None:
    """
    Write metrics to Timestream
    
    Args:
        data: Data containing metrics to write
    """
    records = []
    current_time = str(int(datetime.now().timestamp() * 1000))
    
    for metric_name, metric_value in data.get('metrics', {}).items():
        if not isinstance(metric_value, (int, float)):
            logger.warning(f"Skipping non-numeric metric: {metric_name} = {metric_value}")
            continue
            
        record = {
            'Time': current_time,
            'TimeUnit': 'MILLISECONDS',
            'MeasureName': metric_name,
            'MeasureValue': str(metric_value),
            'MeasureValueType': 'DOUBLE',
            'Dimensions': build_dimensions(data)
        }
        records.append(record)
    
    if records:
        try:
            timestream_client.write_records(
                DatabaseName=os.environ['TIMESTREAM_DATABASE'],
                TableName=os.environ['TIMESTREAM_TABLE'],
                Records=records
            )
            logger.info(f"Written {len(records)} records to Timestream")
        except Exception as e:
            logger.error(f"Error writing to Timestream: {str(e)}")
            raise


def build_dimensions(data: Dict[str, Any]) -> List[Dict[str, str]]:
    """
    Build dimensions for Timestream records
    
    Args:
        data: Source data
        
    Returns:
        List of dimension dictionaries
    """
    dimensions = [
        {
            'Name': 'source',
            'Value': data.get('source', 'unknown')
        },
        {
            'Name': 'region',
            'Value': os.environ.get('AWS_REGION', 'us-east-1')
        }
    ]
    
    # Add additional dimensions from relationships
    relationships = data.get('relationships', {})
    for key, value in relationships.items():
        if isinstance(value, str) and len(value) <= 256:  # Timestream dimension value limit
            dimensions.append({
                'Name': key,
                'Value': value
            })
    
    return dimensions


def archive_to_s3(data: Dict[str, Any], sequence_number: str) -> None:
    """
    Archive raw data to S3
    
    Args:
        data: Data to archive
        sequence_number: Kinesis sequence number for unique key
    """
    try:
        key = f"raw-data/{datetime.now().strftime('%Y/%m/%d')}/{sequence_number}.json"
        
        s3_client.put_object(
            Bucket=os.environ['S3_BUCKET'],
            Key=key,
            Body=json.dumps(data, default=str),
            ServerSideEncryption='aws:kms',
            SSEKMSKeyId=os.environ.get('KMS_KEY_ID'),
            ContentType='application/json'
        )
        logger.debug(f"Archived data to S3: {key}")
        
    except Exception as e:
        logger.error(f"Error archiving to S3: {str(e)}")
        # Don't raise - archiving failure shouldn't stop processing


def write_to_neptune(data: Dict[str, Any]) -> None:
    """
    Write graph data to Neptune (placeholder for future implementation)
    
    Args:
        data: Data containing relationship information
    """
    # TODO: Implement Neptune graph data writing
    # This would involve:
    # 1. Connecting to Neptune using Gremlin or SPARQL
    # 2. Creating vertices and edges based on relationships in data
    # 3. Handling connection pooling and error recovery
    
    relationships = data.get('relationships', {})
    if relationships:
        logger.info(f"Would write relationships to Neptune: {relationships}")
