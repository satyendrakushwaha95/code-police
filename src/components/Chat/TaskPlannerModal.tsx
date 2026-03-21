import { useState } from 'react';
import { useSettings } from '../../store/SettingsContext';
import { useWorkspace } from '../../store/WorkspaceContext';
import { useToast } from '../../hooks/useToast';
import { ollamaService } from '../../services/ollama';
import './Chat.css';

interface Task {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed';
  priority: 'low' | 'medium' | 'high';
  subtasks: Task[];
}

interface TaskPlannerModalProps {
  onClose: () => void;
}

export default function TaskPlannerModal({ onClose }: TaskPlannerModalProps) {
  const [taskDescription, setTaskDescription] = useState('');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  
  const { settings } = useSettings();
  const { state: workspace } = useWorkspace();
  const { showToast } = useToast();

  const generateTasks = async () => {
    if (!taskDescription.trim()) {
      showToast('Please describe the task', 'error');
      return;
    }

    setIsGenerating(true);
    try {
      const contextInfo = workspace.rootPath 
        ? `\n\nThe workspace is at: ${workspace.rootPath}\nFiles: ${workspace.filesIndex.slice(0, 10).map(f => f.path).join(', ')}...`
        : '';

      const messages = [
        { 
          role: 'system' as const, 
          content: `You are a task planning assistant. Break down the user's request into a list of actionable tasks.
          
Respond with a JSON array of tasks in this format:
[
  {
    "title": "Task title",
    "description": "Brief description",
    "priority": "high|medium|low",
    "subtasks": [
      {
        "title": "Subtask title",
        "description": "Brief description"
      }
    ]
  }
]

Only respond with valid JSON, no other text.`
        },
        { 
          role: 'user' as const, 
          content: `Break down this task into steps:${contextInfo}\n\nTask: ${taskDescription}` 
        }
      ];

      let model = settings.model;
      try {
        const routing = await ollamaService.resolveModel(messages, undefined, 'planning');
        model = routing.resolvedModel;
      } catch (err) {
        console.warn('Failed to resolve model, using default:', err);
      }

      const response = await fetch(`${settings.endpoint.replace(/\/$/, '')}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages,
          stream: false
        })
      });

      if (!response.ok) {
        throw new Error(`Failed to generate: ${response.statusText}`);
      }

      const data = await response.json();
      const content = data.message?.content || '';
      
      // Extract JSON from response
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsedTasks = JSON.parse(jsonMatch[0]).map((t: any, i: number) => ({
          id: `task-${Date.now()}-${i}`,
          title: t.title,
          description: t.description,
          status: 'pending' as const,
          priority: t.priority || 'medium',
          subtasks: (t.subtasks || []).map((s: any, j: number) => ({
            id: `subtask-${Date.now()}-${i}-${j}`,
            title: s.title,
            description: s.description,
            status: 'pending' as const,
            priority: 'medium' as const,
            subtasks: []
          }))
        }));
        setTasks(parsedTasks);
      } else {
        showToast('Failed to parse tasks', 'error');
      }
    } catch (err: any) {
      showToast(`Failed to generate tasks: ${err.message}`, 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  const updateTaskStatus = (taskId: string, status: Task['status']) => {
    setTasks(prev => prev.map(t => 
      t.id === taskId ? { ...t, status } : t
    ));
  };

  const deleteTask = (taskId: string) => {
    setTasks(prev => prev.filter(t => t.id !== taskId));
  };

  const getPriorityColor = (priority: Task['priority']) => {
    switch (priority) {
      case 'high': return 'var(--error)';
      case 'medium': return 'var(--accent)';
      case 'low': return 'var(--text-tertiary)';
    }
  };

  const getStatusIcon = (status: Task['status']) => {
    switch (status) {
      case 'completed': return '✓';
      case 'in_progress': return '◐';
      case 'pending': return '○';
    }
  };

  return (
    <div className="modal-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-content task-planner-modal">
        <div className="modal-header">
          <h2>📋 AI Task Planner</h2>
          <button className="btn-icon" onClick={onClose}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/>
              <line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div className="modal-body">
          <div className="task-input-section">
            <textarea
              className="task-input"
              placeholder="Describe the task you want to break down..."
              value={taskDescription}
              onChange={(e) => setTaskDescription(e.target.value)}
              rows={3}
            />
            <button 
              className="btn btn-primary"
              onClick={generateTasks}
              disabled={isGenerating || !taskDescription.trim()}
            >
              {isGenerating ? 'Planning...' : 'Generate Task Plan'}
            </button>
          </div>

          {tasks.length > 0 && (
            <div className="tasks-list">
              <div className="tasks-header">
                <span className="tasks-count">{tasks.length} tasks</span>
                <span className="tasks-progress">
                  {tasks.filter(t => t.status === 'completed').length} / {tasks.length} completed
                </span>
              </div>

              {tasks.map(task => (
                <div 
                  key={task.id} 
                  className={`task-card ${task.status}`}
                  onClick={() => setSelectedTask(selectedTask?.id === task.id ? null : task)}
                >
                  <div className="task-header">
                    <span 
                      className="task-priority"
                      style={{ background: getPriorityColor(task.priority) }}
                    />
                    <span className={`task-status ${task.status}`}>
                      {getStatusIcon(task.status)}
                    </span>
                    <span className="task-title">{task.title}</span>
                    <div className="task-actions">
                      <button 
                        className="task-action-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          const nextStatus = task.status === 'pending' ? 'in_progress' : 
                            task.status === 'in_progress' ? 'completed' : 'pending';
                          updateTaskStatus(task.id, nextStatus);
                        }}
                      >
                        {task.status === 'completed' ? '↩' : '→'}
                      </button>
                      <button 
                        className="task-action-btn delete"
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteTask(task.id);
                        }}
                      >
                        ×
                      </button>
                    </div>
                  </div>
                  
                  {selectedTask?.id === task.id && (
                    <div className="task-details">
                      <p className="task-description">{task.description}</p>
                      {task.subtasks.length > 0 && (
                        <div className="subtasks">
                          <span className="subtasks-label">Subtasks:</span>
                          {task.subtasks.map((subtask, idx) => (
                            <div key={idx} className="subtask-item">
                              <span className="subtask-bullet">•</span>
                              <span className="subtask-title">{subtask.title}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
