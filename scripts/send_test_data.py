#!/usr/bin/env python3
"""
Test data sender for Timestream Neptune Analytics Platform
Sends sample data to Kinesis Data Stream for testing
"""

import json
import boto3
import time
import random
from datetime import datetime
import argparse

def generate_sample_data():
    """Generate sample metrics data"""
    return {
        "timestamp": datetime.now().isoformat(),
        "source": f"sensor-{random.randint(1, 10)}",
        "metrics": {
            "temperature": round(random.uniform(20.0, 35.0), 2),
            "humidity": round(random.uniform(30.0, 80.0), 2),
            "pressure": round(random.uniform(1000.0, 1020.0), 2),
            "cpu_usage": round(random.uniform(10.0, 90.0), 2),
            "memory_usage": round(random.uniform(20.0, 85.0), 2),
            "network_throughput": round(random.uniform(100.0, 1000.0), 2)
        },
        "relationships": {
            "device_id": f"device-{random.randint(1, 5)}",
            "location": random.choice(["tokyo", "osaka", "nagoya", "fukuoka", "sapporo"]),
            "zone": random.choice(["zone-a", "zone-b", "zone-c"])
        }
    }

def send_to_kinesis(stream_name, data, region='us-east-1'):
    """Send data to Kinesis Data Stream"""
    kinesis_client = boto3.client('kinesis', region_name=region)
    
    try:
        response = kinesis_client.put_record(
            StreamName=stream_name,
            Data=json.dumps(data),
            PartitionKey=data['source']
        )
        print(f"✅ Data sent successfully. Shard ID: {response['ShardId']}, Sequence: {response['SequenceNumber']}")
        return True
    except Exception as e:
        print(f"❌ Error sending data: {str(e)}")
        return False

def main():
    parser = argparse.ArgumentParser(description='Send test data to Kinesis stream')
    parser.add_argument('--stream-name', required=True, help='Kinesis stream name')
    parser.add_argument('--region', default='us-east-1', help='AWS region')
    parser.add_argument('--count', type=int, default=10, help='Number of records to send')
    parser.add_argument('--interval', type=float, default=1.0, help='Interval between sends (seconds)')
    
    args = parser.parse_args()
    
    print(f"🚀 Starting to send {args.count} test records to stream '{args.stream_name}'")
    print(f"📍 Region: {args.region}")
    print(f"⏱️  Interval: {args.interval} seconds")
    print("-" * 50)
    
    success_count = 0
    
    for i in range(args.count):
        print(f"📤 Sending record {i+1}/{args.count}...")
        
        # Generate sample data
        sample_data = generate_sample_data()
        
        # Send to Kinesis
        if send_to_kinesis(args.stream_name, sample_data, args.region):
            success_count += 1
        
        # Wait before next send
        if i < args.count - 1:  # Don't wait after the last record
            time.sleep(args.interval)
    
    print("-" * 50)
    print(f"✨ Completed! Successfully sent {success_count}/{args.count} records")
    
    if success_count < args.count:
        print("⚠️  Some records failed to send. Check your AWS credentials and stream name.")

if __name__ == "__main__":
    main()
