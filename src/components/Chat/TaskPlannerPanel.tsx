import { useState, useRef, useEffect } from 'react';
import { useSettings } from '../../store/SettingsContext';
import { useWorkspace } from '../../store/WorkspaceContext';
import { useToast } from '../../hooks/useToast';
import { ollamaService } from '../../services/ollama';

interface Task {
  id: string;
  title: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed';
  priority: 'low' | 'medium' | 'high';
  subtasks: Task[];
}

interface TaskPlannerPanelProps {
  onClose: () => void;
}

export default function TaskPlannerPanel({ onClose }: TaskPlannerPanelProps) {
  const [taskDescription, setTaskDescription] = useState('');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [panelWidth, setPanelWidth] = useState(600);
  const panelRef = useRef<HTMLDivElement>(null);
  const isResizing = useRef(false);
  
  const { settings } = useSettings();
  const { state: workspace } = useWorkspace();
  const { showToast } = useToast();

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isResizing.current) return;
      const newWidth = Math.max(400, Math.min(900, window.innerWidth - e.clientX));
      setPanelWidth(newWidth);
    };

    const handleMouseUp = () => {
      isResizing.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  const startResize = (e: React.MouseEvent) => {
    e.preventDefault();
    isResizing.current = true;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

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
      let providerId = 'ollama-default';
      try {
        const routing = await ollamaService.resolveModel(messages, undefined, 'planning');
        model = routing.resolvedModel;
        providerId = routing.providerId || 'ollama-default';
      } catch (err) {
        console.warn('Failed to resolve model, using default:', err);
      }

      const result = await ollamaService.chatComplete(
        providerId,
        model,
        messages,
        undefined,
        'planning'
      );
      const content = result.content;
      
      try {
        const parsed = JSON.parse(content);
        const generatedTasks: Task[] = parsed.map((t: any, i: number) => ({
          id: `task-${Date.now()}-${i}`,
          title: t.title,
          description: t.description || '',
          status: 'pending' as const,
          priority: t.priority || 'medium',
          subtasks: (t.subtasks || []).map((s: any, j: number) => ({
            id: `subtask-${Date.now()}-${i}-${j}`,
            title: s.title,
            description: s.description || '',
            status: 'pending' as const,
            priority: 'medium' as const,
            subtasks: []
          }))
        }));
        
        setTasks(generatedTasks);
        showToast(`Generated ${generatedTasks.length} tasks`, 'success');
      } catch {
        showToast('Failed to parse tasks from AI response', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Failed to generate tasks', 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  const toggleTaskStatus = (taskId: string) => {
    setTasks(tasks.map(t => {
      if (t.id === taskId) {
        return { ...t, status: t.status === 'completed' ? 'pending' : 'completed' as const };
      }
      return t;
    }));
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'high': return 'var(--error)';
      case 'medium': return 'var(--warning)';
      case 'low': return 'var(--success)';
      default: return 'var(--text-tertiary)';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return '✓';
      case 'in_progress': return '◐';
      default: return '○';
    }
  };

  return (
    <div className="side-panel" ref={panelRef} style={{ width: `${panelWidth}px` }}>
      <div className="side-panel-resize-handle" onMouseDown={startResize} />
      <div className="side-panel-header">
        <div className="side-panel-title">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M9 11l3 3L22 4"/>
            <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/>
          </svg>
          Task Planner
        </div>
        <div className="side-panel-actions">
          <button className="btn-icon" onClick={onClose} title="Close">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      </div>

      <div className="side-panel-content">
        <div className="form-group">
          <label>Describe your task</label>
          <textarea
            value={taskDescription}
            onChange={(e) => setTaskDescription(e.target.value)}
            placeholder="E.g., Create a user authentication system with login, register, and password reset..."
            rows={4}
          />
        </div>

        <button 
          className="btn btn-primary" 
          onClick={generateTasks}
          disabled={isGenerating}
          style={{ width: '100%', marginBottom: '20px' }}
        >
          {isGenerating ? 'Generating...' : 'Generate Tasks'}
        </button>

        {tasks.length > 0 && (
          <div className="tasks-list">
            <h4 style={{ marginBottom: '12px', color: 'var(--text-secondary)' }}>
              Generated Tasks ({tasks.filter(t => t.status === 'completed').length}/{tasks.length})
            </h4>
            
            {tasks.map(task => (
              <div 
                key={task.id}
                className={`task-item ${task.status === 'completed' ? 'completed' : ''}`}
                onClick={() => setSelectedTask(selectedTask?.id === task.id ? null : task)}
                style={{
                  padding: '12px',
                  marginBottom: '8px',
                  background: 'var(--bg-tertiary)',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  border: `2px solid ${task.status === 'completed' ? 'var(--success)' : 'transparent'}`,
                  opacity: task.status === 'completed' ? 0.7 : 1
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span 
                    onClick={(e) => { e.stopPropagation(); toggleTaskStatus(task.id); }}
                    style={{ 
                      color: task.status === 'completed' ? 'var(--success)' : 'var(--text-tertiary)',
                      cursor: 'pointer',
                      fontSize: '16px'
                    }}
                  >
                    {getStatusIcon(task.status)}
                  </span>
                  <span style={{ 
                    flex: 1, 
                    textDecoration: task.status === 'completed' ? 'line-through' : 'none'
                  }}>
                    {task.title}
                  </span>
                  <span style={{ 
                    fontSize: '10px', 
                    padding: '2px 6px', 
                    borderRadius: '4px',
                    background: getPriorityColor(task.priority),
                    color: '#000'
                  }}>
                    {task.priority}
                  </span>
                </div>
                
                {selectedTask?.id === task.id && (
                  <div style={{ marginTop: '12px', paddingLeft: '26px' }}>
                    <p style={{ color: 'var(--text-secondary)', fontSize: '13px', marginBottom: '8px' }}>
                      {task.description}
                    </p>
                    {task.subtasks.length > 0 && (
                      <div>
                        <span style={{ fontSize: '12px', color: 'var(--text-tertiary)' }}>Subtasks:</span>
                        {task.subtasks.map(st => (
                          <div key={st.id} style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: '6px', 
                            padding: '4px 0',
                            fontSize: '13px',
                            color: 'var(--text-secondary)'
                          }}>
                            <span>○</span> {st.title}
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
  );
}
