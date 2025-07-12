"""
Query Lambda Function
Handles API requests for querying time-series and graph data
"""

import json
import boto3
import os
import logging
from typing import Dict, List, Any, Optional
from datetime import datetime, timedelta

# Configure logging
logger = logging.getLogger()
logger.setLevel(logging.INFO)

# Initialize AWS clients
timestream_client = boto3.client('timestream-query')


def handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Main handler function for API Gateway requests
    
    Args:
        event: API Gateway event
        context: Lambda context
        
    Returns:
        API Gateway response
    """
    try:
        # Extract query parameters
        query_params = event.get('queryStringParameters') or {}
        query_type = query_params.get('type', 'metrics')
        
        # Route to appropriate handler
        if query_type == 'metrics':
            result = handle_metrics_query(query_params)
        elif query_type == 'aggregated':
            result = handle_aggregated_query(query_params)
        elif query_type == 'health':
            result = handle_health_check()
        else:
            result = {'error': f'Unsupported query type: {query_type}'}
        
        return create_response(200, result)
        
    except Exception as e:
        logger.error(f"Error processing query: {str(e)}")
        return create_response(500, {'error': str(e)})


def create_response(status_code: int, body: Dict[str, Any]) -> Dict[str, Any]:
    """
    Create standardized API Gateway response
    
    Args:
        status_code: HTTP status code
        body: Response body
        
    Returns:
        API Gateway response format
    """
    return {
        'statusCode': status_code,
        'headers': {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
        'body': json.dumps(body, default=str)
    }


def handle_metrics_query(params: Dict[str, str]) -> Dict[str, Any]:
    """
    Handle metrics query requests
    
    Args:
        params: Query parameters
        
    Returns:
        Query results
    """
    # Parse time range parameters
    hours_back = int(params.get('hours', '1'))
    source_filter = params.get('source')
    
    # Build and execute query
    query = build_metrics_query(hours_back, source_filter)
    results = execute_timestream_query(query)
    
    return {
        'query_type': 'metrics',
        'time_range_hours': hours_back,
        'source_filter': source_filter,
        'results': results,
        'timestamp': datetime.now().isoformat()
    }


def handle_aggregated_query(params: Dict[str, str]) -> Dict[str, Any]:
    """
    Handle aggregated metrics query requests
    
    Args:
        params: Query parameters
        
    Returns:
        Aggregated query results
    """
    hours_back = int(params.get('hours', '24'))
    metric_name = params.get('metric')
    
    query = build_aggregated_query(hours_back, metric_name)
    results = execute_timestream_query(query)
    
    return {
        'query_type': 'aggregated',
        'time_range_hours': hours_back,
        'metric_filter': metric_name,
        'results': results,
        'timestamp': datetime.now().isoformat()
    }


def handle_health_check() -> Dict[str, Any]:
    """
    Handle health check requests
    
    Returns:
        Health status
    """
    try:
        # Simple query to test Timestream connectivity
        query = f"""
        SELECT COUNT(*) as record_count
        FROM "{os.environ['TIMESTREAM_DATABASE']}"."{os.environ['TIMESTREAM_TABLE']}"
        WHERE time > ago(1h)
        """
        
        result = execute_timestream_query(query)
        record_count = result[0].get('record_count', '0') if result else '0'
        
        return {
            'status': 'healthy',
            'timestream_connectivity': 'ok',
            'recent_records': record_count,
            'timestamp': datetime.now().isoformat()
        }
        
    except Exception as e:
        logger.error(f"Health check failed: {str(e)}")
        return {
            'status': 'unhealthy',
            'error': str(e),
            'timestamp': datetime.now().isoformat()
        }


def build_metrics_query(hours_back: int, source_filter: Optional[str] = None) -> str:
    """
    Build Timestream query for metrics
    
    Args:
        hours_back: Number of hours to look back
        source_filter: Optional source filter
        
    Returns:
        Timestream query string
    """
    where_clauses = [f"time > ago({hours_back}h)"]
    
    if source_filter:
        where_clauses.append(f"source = '{source_filter}'")
    
    where_clause = " AND ".join(where_clauses)
    
    return f"""
    SELECT 
        measure_name,
        AVG(measure_value::double) as avg_value,
        MAX(measure_value::double) as max_value,
        MIN(measure_value::double) as min_value,
        COUNT(*) as count,
        source
    FROM "{os.environ['TIMESTREAM_DATABASE']}"."{os.environ['TIMESTREAM_TABLE']}"
    WHERE {where_clause}
    GROUP BY measure_name, source
    ORDER BY measure_name, source
    """


def build_aggregated_query(hours_back: int, metric_name: Optional[str] = None) -> str:
    """
    Build Timestream query for aggregated data
    
    Args:
        hours_back: Number of hours to look back
        metric_name: Optional metric name filter
        
    Returns:
        Timestream query string
    """
    where_clauses = [f"time > ago({hours_back}h)"]
    
    if metric_name:
        where_clauses.append(f"measure_name = '{metric_name}'")
    
    where_clause = " AND ".join(where_clauses)
    
    return f"""
    SELECT 
        bin(time, 1h) as time_bucket,
        measure_name,
        AVG(measure_value::double) as avg_value,
        COUNT(*) as count
    FROM "{os.environ['TIMESTREAM_DATABASE']}"."{os.environ['TIMESTREAM_TABLE']}"
    WHERE {where_clause}
    GROUP BY bin(time, 1h), measure_name
    ORDER BY time_bucket DESC, measure_name
    """


def execute_timestream_query(query: str) -> List[Dict[str, Any]]:
    """
    Execute Timestream query and return results
    
    Args:
        query: Timestream query string
        
    Returns:
        List of result dictionaries
    """
    try:
        logger.info(f"Executing query: {query}")
        
        response = timestream_client.query(QueryString=query)
        
        results = []
        for row in response.get('Rows', []):
            result = {}
            for i, column in enumerate(response.get('ColumnInfo', [])):
                column_name = column.get('Name', f'column_{i}')
                column_value = row.get('Data', [{}])[i].get('ScalarValue', '')
                result[column_name] = column_value
            results.append(result)
        
        logger.info(f"Query returned {len(results)} rows")
        return results
        
    except Exception as e:
        logger.error(f"Error executing Timestream query: {str(e)}")
        raise
