"""
意图识别监控

监控意图识别系统的性能和准确度
"""

import time
import json
from datetime import datetime
from typing import Dict, List, Any, Optional
from dataclasses import dataclass, field, asdict
from pathlib import Path

@dataclass
class MonitoringEvent:
    """监控事件"""
    timestamp: str
    event_type: str  # "recognition", "retrieval", "error"
    user_prompt: str
    session_id: str
    result: Any = None
    error: str = None
    processing_time: float = 0.0
    confidence: float = 0.0
    metadata: Dict[str, Any] = field(default_factory=dict)

@dataclass
class PerformanceMetrics:
    """性能指标"""
    total_requests: int = 0
    successful_requests: int = 0
    failed_requests: int = 0
    average_processing_time: float = 0.0
    average_confidence: float = 0.0
    cache_hit_rate: float = 0.0
    
    # 按意图类型分类的统计
    intent_type_stats: Dict[str, Dict[str, float]] = field(default_factory=dict)
    
    # 时间分布
    response_time_distribution: Dict[str, int] = field(default_factory=dict)

class IntentRecognitionMonitor:
    """意图识别监控"""
    
    def __init__(self, log_file: Optional[str] = None):
        """
        初始化监控器
        
        Args:
            log_file: 监控日志文件路径
        """
        if log_file:
            self.log_file = Path(log_file)
        else:
            self.log_file = Path(__file__).parent.parent.parent / "logs" / "monitor.log"
        
        # 确保日志目录存在
        self.log_file.parent.mkdir(parents=True, exist_ok=True)
        
        # 性能指标
        self.metrics = PerformanceMetrics()
        
        # 事件记录
        self.events: List[MonitoringEvent] = []
        self.max_events = 1000  # 最大事件记录数量
        
        # 时间统计
        self.processing_times: List[float] = []
        self.confidence_scores: List[float] = []
    
    def record_recognition(self, 
                         user_prompt: str,
                         session_id: str,
                         result: Any,
                         processing_time: float,
                         confidence: float):
        """记录意图识别事件"""
        event = MonitoringEvent(
            timestamp=datetime.now().isoformat(),
            event_type="recognition",
            user_prompt=user_prompt,
            session_id=session_id,
            result=result,
            processing_time=processing_time,
            confidence=confidence,
            metadata={}
        )
        
        self._add_event(event)
        self._update_metrics(event)
    
    def record_retrieval(self,
                        user_prompt: str,
                        session_id: str,
                        result: Any,
                        processing_time: float):
        """记录检索事件"""
        event = MonitoringEvent(
            timestamp=datetime.now().isoformat(),
            event_type="retrieval",
            user_prompt=user_prompt,
            session_id=session_id,
            result=result,
            processing_time=processing_time,
            metadata={}
        )
        
        self._add_event(event)
    
    def record_error(self,
                    user_prompt: str,
                    session_id: str,
                    error: str):
        """记录错误事件"""
        event = MonitoringEvent(
            timestamp=datetime.now().isoformat(),
            event_type="error",
            user_prompt=user_prompt,
            session_id=session_id,
            error=error,
            metadata={}
        )
        
        self._add_event(event)
        self.metrics.failed_requests += 1
    
    def _add_event(self, event: MonitoringEvent):
        """添加事件"""
        self.events.append(event)
        
        # 限制事件数量
        if len(self.events) > self.max_events:
            self.events.pop(0)
        
        # 写入日志文件
        self._write_log(event)
    
    def _write_log(self, event: MonitoringEvent):
        """写入日志文件"""
        try:
            log_entry = {
                'timestamp': event.timestamp,
                'event_type': event.event_type,
                'user_prompt': event.user_prompt,
                'session_id': event.session_id,
                'processing_time': event.processing_time,
                'confidence': event.confidence,
                'error': event.error,
                'metadata': event.metadata
            }
            
            with open(self.log_file, 'a', encoding='utf-8') as f:
                f.write(json.dumps(log_entry, ensure_ascii=False) + '\n')
                
        except Exception as e:
            print(f"写入监控日志失败: {e}")
    
    def _update_metrics(self, event: MonitoringEvent):
        """更新性能指标"""
        self.metrics.total_requests += 1
        
        if event.event_type == "recognition":
            self.metrics.successful_requests += 1
            
            # 更新处理时间统计
            self.processing_times.append(event.processing_time)
            if len(self.processing_times) > 1000:  # 限制统计数量
                self.processing_times.pop(0)
            
            # 更新置信度统计
            self.confidence_scores.append(event.confidence)
            if len(self.confidence_scores) > 1000:
                self.confidence_scores.pop(0)
            
            # 更新平均指标
            self.metrics.average_processing_time = sum(self.processing_times) / len(self.processing_times)
            self.metrics.average_confidence = sum(self.confidence_scores) / len(self.confidence_scores)
            
            # 更新响应时间分布
            time_bucket = self._get_time_bucket(event.processing_time)
            self.metrics.response_time_distribution[time_bucket] = \
                self.metrics.response_time_distribution.get(time_bucket, 0) + 1
            
            # 更新意图类型统计
            if hasattr(event.result, 'enhanced_intent'):
                intent_type = event.result.enhanced_intent.intent_type
                if intent_type not in self.metrics.intent_type_stats:
                    self.metrics.intent_type_stats[intent_type] = {
                        'count': 0,
                        'avg_confidence': 0.0,
                        'avg_time': 0.0
                    }
                
                stats = self.metrics.intent_type_stats[intent_type]
                stats['count'] += 1
                stats['avg_confidence'] = (stats['avg_confidence'] * (stats['count'] - 1) + event.confidence) / stats['count']
                stats['avg_time'] = (stats['avg_time'] * (stats['count'] - 1) + event.processing_time) / stats['count']
    
    def _get_time_bucket(self, time_seconds: float) -> str:
        """获取时间分段"""
        if time_seconds < 0.1:
            return "0-0.1s"
        elif time_seconds < 0.5:
            return "0.1-0.5s"
        elif time_seconds < 1.0:
            return "0.5-1.0s"
        elif time_seconds < 2.0:
            return "1.0-2.0s"
        elif time_seconds < 5.0:
            return "2.0-5.0s"
        else:
            return ">5.0s"
    
    def get_metrics(self) -> Dict[str, Any]:
        """获取性能指标"""
        metrics_dict = asdict(self.metrics)
        
        # 计算成功率和缓存命中率
        if self.metrics.total_requests > 0:
            success_rate = self.metrics.successful_requests / self.metrics.total_requests
            metrics_dict['success_rate'] = success_rate
        else:
            metrics_dict['success_rate'] = 0.0
        
        # 计算P95、P99响应时间
        if self.processing_times:
            sorted_times = sorted(self.processing_times)
            p95_index = int(len(sorted_times) * 0.95)
            p99_index = int(len(sorted_times) * 0.99)
            metrics_dict['p95_response_time'] = sorted_times[p95_index]
            metrics_dict['p99_response_time'] = sorted_times[p99_index]
        
        return metrics_dict
    
    def get_recent_events(self, limit: int = 10) -> List[MonitoringEvent]:
        """获取最近的事件"""
        return self.events[-limit:]
    
    def get_events_by_session(self, session_id: str) -> List[MonitoringEvent]:
        """获取特定会话的事件"""
        return [event for event in self.events if event.session_id == session_id]
    
    def get_events_by_type(self, event_type: str) -> List[MonitoringEvent]:
        """获取特定类型的事件"""
        return [event for event in self.events if event.event_type == event_type]
    
    def generate_report(self) -> str:
        """生成监控报告"""
        metrics = self.get_metrics()
        
        report = f"""
=== 意图识别系统监控报告 ===
生成时间: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}

## 总体指标
- 总请求数: {metrics['total_requests']}
- 成功请求数: {metrics['successful_requests']}
- 失败请求数: {metrics['failed_requests']}
- 成功率: {metrics.get('success_rate', 0) * 100:.2f}%

## 性能指标
- 平均处理时间: {metrics['average_processing_time']:.3f}s
- 平均置信度: {metrics['average_confidence']:.3f}
- P95响应时间: {metrics.get('p95_response_time', 0):.3f}s
- P99响应时间: {metrics.get('p99_response_time', 0):.3f}s

## 响应时间分布
"""
        
        for time_bucket, count in metrics['response_time_distribution'].items():
            percentage = (count / metrics['total_requests'] * 100) if metrics['total_requests'] > 0 else 0
            report += f"- {time_bucket}: {count} ({percentage:.1f}%)\n"
        
        report += "\n## 意图类型分布\n"
        
        for intent_type, stats in metrics['intent_type_stats'].items():
            count = stats['count']
            percentage = (count / metrics['total_requests'] * 100) if metrics['total_requests'] > 0 else 0
            report += f"- {intent_type}: {count} ({percentage:.1f}%), "
            report += f"平均置信度: {stats['avg_confidence']:.3f}, "
            report += f"平均时间: {stats['avg_time']:.3f}s\n"
        
        return report
    
    def clear_events(self):
        """清除事件记录"""
        self.events.clear()
        self.processing_times.clear()
        self.confidence_scores.clear()
    
    def export_metrics(self, file_path: str):
        """导出指标到文件"""
        metrics = self.get_metrics()
        
        export_path = Path(file_path)
        export_path.parent.mkdir(parents=True, exist_ok=True)
        
        with open(export_path, 'w', encoding='utf-8') as f:
            json.dump(metrics, f, indent=2, ensure_ascii=False)
        
        return True
    
    def load_metrics(self, file_path: str):
        """从文件加载指标"""
        try:
            with open(file_path, 'r', encoding='utf-8') as f:
                metrics_dict = json.load(f)
            
            self.metrics = PerformanceMetrics(**metrics_dict)
            return True
        except Exception as e:
            print(f"加载指标失败: {e}")
            return False

# 全局监控器实例
_global_monitor = None

def get_monitor(log_file: Optional[str] = None) -> IntentRecognitionMonitor:
    """获取全局监控器实例"""
    global _global_monitor
    if _global_monitor is None:
        _global_monitor = IntentRecognitionMonitor(log_file)
    return _global_monitor