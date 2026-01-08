'use client';

import React, { useState, useEffect } from 'react';
import { db } from './firebase';
import { doc, getDoc, setDoc, onSnapshot } from 'firebase/firestore';

export default function TristanTaskManager() {
  const [tasks, setTasks] = useState([]);
  const [archivedTasks, setArchivedTasks] = useState([]);
  const [grades, setGrades] = useState([]);
  const [events, setEvents] = useState([]);
  const [currentQuarter, setCurrentQuarter] = useState('q3');
  const [viewQuarter, setViewQuarter] = useState('q3');
  const [expandedClass, setExpandedClass] = useState(null);
  const [showAddTask, setShowAddTask] = useState(false);
  const [showAddGrade, setShowAddGrade] = useState(false);
  const [showAddEvent, setShowAddEvent] = useState(false);
  const [showArchive, setShowArchive] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showPasteImport, setShowPasteImport] = useState(false);
  const [showFactsPaste, setShowFactsPaste] = useState(false);
  const [factsText, setFactsText] = useState('');
  const [factsParsed, setFactsParsed] = useState(null);
  const [pasteData, setPasteData] = useState('');
  const [importData, setImportData] = useState(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importSummary, setImportSummary] = useState(null);
  const [newTask, setNewTask] = useState({ title: '', category: 'homework', dueDate: '', notes: '' });
  const [newGrade, setNewGrade] = useState({ subject: '', grade: '', letterGrade: '', quarter: 'q3' });
  const [newEvent, setNewEvent] = useState({ title: '', date: '', time: '', notes: '' });
  const [streak, setStreak] = useState(0);
  const [totalCompleted, setTotalCompleted] = useState(0);
  const [activeFilter, setActiveFilter] = useState('all');
  const [activeView, setActiveView] = useState('tasks');
  const [isLoading, setIsLoading] = useState(true);
  const [calendarMonth, setCalendarMonth] = useState(new Date());

  // Firebase document reference
  const dataDocRef = doc(db, 'users', 'tristan');

  // Load data from Firebase on mount and listen for changes
  useEffect(() => {
    const unsubscribe = onSnapshot(dataDocRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setTasks(data.tasks || []);
        setArchivedTasks(data.archivedTasks || []);
        setGrades(data.grades || []);
        setEvents(data.events || []);
        setStreak(data.streak || 0);
        setTotalCompleted(data.totalCompleted || 0);
      }
      setIsLoading(false);
    }, (error) => {
      console.error('Error loading data:', error);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Save data to Firebase whenever it changes
  const saveToFirebase = async (newData) => {
    try {
      await setDoc(dataDocRef, newData, { merge: true });
    } catch (error) {
      console.error('Error saving:', error);
    }
  };

  // Parse FACTS page text for grades or homework
  const parseFactsText = (text) => {
    const result = {
      type: null, // 'grades' or 'homework'
      subject: '',
      quarter: 'q3',
      overallGrade: '',
      letterGrade: '',
      assessmentWeight: 55,
      hwcwWeight: 45,
      assignments: [],
      homeworkTasks: []
    };

    // Detect if this is a grades page or homework page
    if (text.includes('Term Grade') || text.includes('Gradebook Report') || text.includes('Weight =')) {
      result.type = 'grades';
      
      // Find subject
      const subjects = ['Bible', 'History', 'Math', 'Science', 'Spanish', 'Language Arts', 'Art', 'Music', 'PE'];
      for (const subj of subjects) {
        if (text.includes(subj)) {
          result.subject = subj;
          break;
        }
      }
      
      // Find quarter
      if (text.includes('Q1')) result.quarter = 'q1';
      else if (text.includes('Q2')) result.quarter = 'q2';
      else if (text.includes('Q3')) result.quarter = 'q3';
      else if (text.includes('Q4')) result.quarter = 'q4';
      
      // Find term grade
      const termMatch = text.match(/Term\s*Grade\s*(\d+)\s*([A-F][+-]?)?/i);
      if (termMatch) {
        result.overallGrade = termMatch[1];
        result.letterGrade = termMatch[2] || '';
      }
      
      // Find weights
      const assWeightMatch = text.match(/Assessments[\s\S]*?Weight\s*=\s*(\d+)/i);
      if (assWeightMatch) result.assessmentWeight = parseInt(assWeightMatch[1]);
      
      const hwWeightMatch = text.match(/HW\/CW[\s\S]*?Weight\s*=\s*(\d+)/i);
      if (hwWeightMatch) result.hwcwWeight = parseInt(hwWeightMatch[1]);
      
      // Parse assignments - look for lines with points pattern
      const lines = text.split('\n');
      let currentCategory = 'assessment';
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        
        if (line.startsWith('Assessments')) {
          currentCategory = 'assessment';
          continue;
        }
        if (line.startsWith('HW/CW')) {
          currentCategory = 'hwcw';
          continue;
        }
        if (line.includes('Category Average') || line.includes('Term Grade')) continue;
        if (line.includes('Assignment') && line.includes('Pts') && line.includes('Max')) continue;
        
        // Try to match assignment line: Name followed by numbers
        // Pattern: "Assignment Name    80    100    80    Valid    01/07"
        const match = line.match(/^(.+?)\s+(\d+)\s+(\d+)\s+(\d+)\s+(Valid|Invalid)/i);
        if (match) {
          const name = match[1].trim();
          const pts = parseInt(match[2]);
          const max = parseInt(match[3]);
          if (max > 0 && name.length > 2) {
            const grade = Math.round((pts / max) * 100);
            result.assignments.push({
              name: name.substring(0, 100),
              grade: String(grade),
              category: currentCategory,
              dateAdded: new Date().toISOString(),
              id: Date.now() + Math.random()
            });
          }
        }
      }
    } else {
      // This is homework page
      result.type = 'homework';
      
      const lines = text.split('\n');
      let currentSubject = '';
      let currentDayDate = ''; // Date from day header like "Monday 1/5/2026"
      const subjects = ['History', 'Language Arts', 'Math 1', 'Math', 'Science', 'Spanish', 'Bible', 'Art', 'Music', 'PE'];
      
      // Helper to convert date string to YYYY-MM-DD format
      const formatDate = (dateStr) => {
        // Handle MM/DD/YYYY format
        const slashMatch = dateStr.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
        if (slashMatch) {
          return `${slashMatch[3]}-${slashMatch[1].padStart(2, '0')}-${slashMatch[2].padStart(2, '0')}`;
        }
        // Handle "Jan 16th" or "January 16" format
        const monthMatch = dateStr.match(/(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s*(\d{1,2})/i);
        if (monthMatch) {
          const months = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' };
          const month = months[monthMatch[1].toLowerCase().substring(0, 3)];
          const day = monthMatch[2].padStart(2, '0');
          const year = new Date().getFullYear(); // Assume current year
          return `${year}-${month}-${day}`;
        }
        return '';
      };
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        
        // Check for day header like "Monday 1/5/2026" or "Tuesday 1/6/2026"
        const dayHeaderMatch = line.match(/^(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s+(\d{1,2}\/\d{1,2}\/\d{4})/i);
        if (dayHeaderMatch) {
          currentDayDate = formatDate(dayHeaderMatch[2]);
          currentSubject = ''; // Reset subject on new day
          continue;
        }
        
        // Check if this line is a subject header
        const foundSubject = subjects.find(s => line === s || line.startsWith(s + ' ') || line.toLowerCase() === s.toLowerCase());
        if (foundSubject) {
          currentSubject = foundSubject;
          continue;
        }
        
        // Skip non-assignment lines
        if (!currentSubject) continue;
        if (line.length < 15) continue;
        if (line.match(/^(Print|Week of|Previous|Next|Student|Sort|Include|Tristan|\d{1,2}\/\d{1,2}\/\d{4}$)/i)) continue;
        
        // Extract specific due date if present in the line (overrides day header date)
        let dueDate = currentDayDate; // Default to the day header date
        
        // Check for explicit due date in the line: "Due:01/16/2026" or "(Due: 01/16/2026)" or "due Fri, Jan 16th"
        const explicitDateMatch = line.match(/[Dd]ue[:\s]*(\d{1,2}\/\d{1,2}\/\d{4})/);
        if (explicitDateMatch) {
          dueDate = formatDate(explicitDateMatch[1]);
        } else {
          // Check for "due Fri, Jan 16th" or "due January 16" format
          const textDateMatch = line.match(/[Dd]ue[:\s]*(?:\w+,?\s*)?(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s*(\d{1,2})/i);
          if (textDateMatch) {
            dueDate = formatDate(`${textDateMatch[1]} ${textDateMatch[2]}`);
          }
        }
        
        // Also check for "by Thursday" or "by Friday" type dates - use day header as reference
        const byDayMatch = line.match(/by\s+(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)/i);
        if (byDayMatch && !explicitDateMatch && currentDayDate) {
          // Calculate the date for that day relative to the day header date
          const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
          const targetDayIndex = days.indexOf(byDayMatch[1].toLowerCase());
          
          // Parse the day header date to use as reference
          const headerDate = new Date(currentDayDate + 'T00:00:00');
          const headerDayIndex = headerDate.getDay();
          
          // Calculate days to add from the header date to the target day
          let daysToAdd = targetDayIndex - headerDayIndex;
          if (daysToAdd <= 0) daysToAdd += 7; // If same day or earlier, go to next week
          
          const targetDate = new Date(headerDate);
          targetDate.setDate(headerDate.getDate() + daysToAdd);
          dueDate = targetDate.toISOString().split('T')[0];
        }
        
        // Clean up title
        let title = line
          .replace(/\(Due:?.*?\)/gi, '')
          .replace(/Due:?\s*\d{1,2}\/\d{1,2}\/\d{4}/gi, '')
          .replace(/[Dd]ue[:\s]*(?:\w+,?\s*)?(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s*\d{1,2}(?:st|nd|rd|th)?/gi, '')
          .replace(/Assigned:\s*/gi, '')
          .replace(/by\s+(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)\s*\.?/gi, '')
          .trim();
        
        if (title.length > 10 && title.length < 300) {
          // Check for duplicates
          const exists = result.homeworkTasks.some(t => 
            t.title.toLowerCase().includes(title.substring(0, 25).toLowerCase())
          );
          
          if (!exists) {
            result.homeworkTasks.push({
              id: Date.now() + Math.random(),
              title: `${title} (${currentSubject})`,
              category: 'homework',
              dueDate: dueDate,
              notes: '',
              completed: false,
              createdAt: new Date().toISOString()
            });
          }
        }
        
        // Reset subject on day headers
        if (line.match(/^(Monday|Tuesday|Wednesday|Thursday|Friday)\s+\d{1,2}\/\d{1,2}\/\d{4}/i)) {
          currentSubject = '';
        }
      }
    }
    
    return result;
  };

  // Import parsed FACTS data
  const importFactsData = () => {
    if (!factsParsed) return;
    
    if (factsParsed.type === 'grades' && factsParsed.subject) {
      // Import grades
      const newGrades = [...grades];
      const quarter = factsParsed.quarter;
      const existingIdx = newGrades.findIndex(g => 
        g.subject?.toLowerCase() === factsParsed.subject.toLowerCase()
      );
      
      if (existingIdx >= 0) {
        const existing = newGrades[existingIdx];
        const existingQuarter = existing[quarter] || { assignments: [] };
        const existingAssignments = existingQuarter.assignments || [];
        
        // Filter out duplicates
        const newAssignments = factsParsed.assignments.filter(na => 
          !existingAssignments.some(ea => 
            ea.name?.toLowerCase().replace(/[^a-z0-9]/g, '') === na.name.toLowerCase().replace(/[^a-z0-9]/g, '')
          )
        );
        
        newGrades[existingIdx] = {
          ...existing,
          [quarter]: {
            overall: factsParsed.overallGrade,
            letterGrade: factsParsed.letterGrade,
            assessmentWeight: factsParsed.assessmentWeight,
            hwcwWeight: factsParsed.hwcwWeight,
            assignments: [...existingAssignments, ...newAssignments]
          },
          lastUpdated: new Date().toISOString()
        };
      } else {
        newGrades.push({
          id: Date.now(),
          subject: factsParsed.subject,
          q1: null, q2: null, q3: null, q4: null,
          [quarter]: {
            overall: factsParsed.overallGrade,
            letterGrade: factsParsed.letterGrade,
            assessmentWeight: factsParsed.assessmentWeight,
            hwcwWeight: factsParsed.hwcwWeight,
            assignments: factsParsed.assignments
          },
          lastUpdated: new Date().toISOString()
        });
      }
      
      setGrades(newGrades);
      saveToFirebase({ grades: newGrades });
      alert(`✓ ${factsParsed.subject} grades imported!\n\nGrade: ${factsParsed.overallGrade}% ${factsParsed.letterGrade}\nAssignments: ${factsParsed.assignments.length}`);
      
    } else if (factsParsed.type === 'homework' && factsParsed.homeworkTasks.length > 0) {
      // Import homework as tasks
      const existingTitles = tasks.map(t => t.title?.toLowerCase().substring(0, 30) || '');
      const newTasks = factsParsed.homeworkTasks.filter(nt => {
        const ntTitle = nt.title.toLowerCase().substring(0, 30);
        return !existingTitles.some(et => et.includes(ntTitle) || ntTitle.includes(et));
      });
      
      const allTasks = [...tasks, ...newTasks];
      setTasks(allTasks);
      saveToFirebase({ tasks: allTasks });
      alert(`✓ Homework imported!\n\nAdded: ${newTasks.length}\nSkipped (duplicates): ${factsParsed.homeworkTasks.length - newTasks.length}`);
    }
    
    setShowFactsPaste(false);
    setFactsText('');
    setFactsParsed(null);
  };

  // Auto-archive completed tasks older than 24 hours
  useEffect(() => {
    if (!isLoading && tasks.length > 0) {
      const now = new Date().getTime();
      const dayAgo = now - (24 * 60 * 60 * 1000);
      
      const toArchive = tasks.filter(t => t.completed && new Date(t.completedAt).getTime() < dayAgo);
      const remaining = tasks.filter(t => !t.completed || new Date(t.completedAt).getTime() >= dayAgo);
      
      if (toArchive.length > 0) {
        const newArchived = [...toArchive, ...archivedTasks];
        setArchivedTasks(newArchived);
        setTasks(remaining);
        saveToFirebase({ tasks: remaining, archivedTasks: newArchived });
      }
    }
  }, [tasks, isLoading]);

  const categories = [
    { id: 'homework', label: 'Homework', icon: '📚', color: '#3B82F6' },
    { id: 'chores', label: 'Chores', icon: '🏠', color: '#10B981' },
    { id: 'projects', label: 'Projects', icon: '🎯', color: '#8B5CF6' },
    { id: 'reading', label: 'Reading', icon: '📖', color: '#F59E0B' }
  ];

  const getGradeColor = (grade) => {
    const num = parseFloat(grade);
    if (num >= 95) return '#10B981';
    if (num >= 86) return '#3B82F6';
    return '#EF4444';
  };

  const addTask = () => {
    if (!newTask.title.trim()) return;
    const task = {
      id: Date.now(),
      ...newTask,
      completed: false,
      createdAt: new Date().toISOString()
    };
    const newTasks = [...tasks, task];
    setTasks(newTasks);
    saveToFirebase({ tasks: newTasks });
    setNewTask({ title: '', category: 'homework', dueDate: '', notes: '' });
    setShowAddTask(false);
  };

  const toggleTask = (id) => {
    let newStreak = streak;
    let newTotalCompleted = totalCompleted;
    
    const newTasks = tasks.map(task => {
      if (task.id === id) {
        if (!task.completed) {
          newTotalCompleted += 1;
          newStreak += 1;
          return { ...task, completed: true, completedAt: new Date().toISOString() };
        }
        return { ...task, completed: false, completedAt: null };
      }
      return task;
    });
    
    setTasks(newTasks);
    setStreak(newStreak);
    setTotalCompleted(newTotalCompleted);
    saveToFirebase({ tasks: newTasks, streak: newStreak, totalCompleted: newTotalCompleted });
  };

  const deleteTask = (id) => {
    const newTasks = tasks.filter(task => task.id !== id);
    setTasks(newTasks);
    saveToFirebase({ tasks: newTasks });
  };

  const addGrade = () => {
    if (!newGrade.subject.trim()) return;
    const quarter = newGrade.quarter || currentQuarter;
    let newGrades = [...grades];
    const existingIndex = newGrades.findIndex(g => g.subject.toLowerCase() === newGrade.subject.toLowerCase());
    
    if (existingIndex >= 0) {
      newGrades[existingIndex] = { 
        ...newGrades[existingIndex], 
        [quarter]: { 
          overall: newGrade.grade, 
          letterGrade: newGrade.letterGrade,
          assessmentWeight: 55,
          hwcwWeight: 45,
          assignments: newGrades[existingIndex][quarter]?.assignments || []
        },
        lastUpdated: new Date().toISOString()
      };
    } else {
      newGrades.push({ 
        id: Date.now(),
        subject: newGrade.subject, 
        q1: null, q2: null, q3: null, q4: null,
        [quarter]: { 
          overall: newGrade.grade, 
          letterGrade: newGrade.letterGrade,
          assessmentWeight: 55,
          hwcwWeight: 45,
          assignments: []
        },
        lastUpdated: new Date().toISOString()
      });
    }
    
    setGrades(newGrades);
    saveToFirebase({ grades: newGrades });
    setNewGrade({ subject: '', grade: '', letterGrade: '', quarter: currentQuarter });
    setShowAddGrade(false);
  };

  const deleteGrade = (id) => {
    const newGrades = grades.filter(g => g.id !== id);
    setGrades(newGrades);
    saveToFirebase({ grades: newGrades });
  };

  const addEvent = () => {
    if (!newEvent.title.trim() || !newEvent.date) return;
    const newEvents = [...events, { ...newEvent, id: Date.now() }];
    setEvents(newEvents);
    saveToFirebase({ events: newEvents });
    setNewEvent({ title: '', date: '', time: '', notes: '' });
    setShowAddEvent(false);
  };

  const deleteEvent = (id) => {
    const newEvents = events.filter(e => e.id !== id);
    setEvents(newEvents);
    saveToFirebase({ events: newEvents });
  };

  const normalizeForComparison = (str) => {
    return str.toLowerCase().replace(/[^a-z0-9]/g, '').trim();
  };

  const isSameAssignment = (task1Title, task2Title) => {
    const norm1 = normalizeForComparison(task1Title);
    const norm2 = normalizeForComparison(task2Title);
    if (norm1 === norm2) return true;
    if (norm1.includes(norm2) || norm2.includes(norm1)) return true;
    if (norm1.length > 20 && norm2.length > 20 && norm1.substring(0, 30) === norm2.substring(0, 30)) return true;
    return false;
  };

  // PDF Import Handler - Note: This won't work in deployed version without API key
  // For now, we'll show a message about manual import
  const handleFileUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    // For the deployed version, show instructions for manual import
    alert('PDF import requires the Claude interface. For now, please use the Claude chat to import PDFs, or add grades manually using the + Update button.');
    setShowImport(false);
  };

  const confirmImport = () => {
    if (!importData) return;
    
    const now = new Date().toISOString();
    let newGrades = [...grades];
    let newTasks = [...tasks];
    let newEvents = [...events];
    
    // Import class grades
    if (importData.classGrades && importData.classGrades.length > 0) {
      importData.classGrades.forEach(cg => {
        const quarter = cg.quarter || currentQuarter;
        const existingIdx = newGrades.findIndex(g => 
          normalizeForComparison(g.subject) === normalizeForComparison(cg.subject)
        );
        
        if (existingIdx >= 0) {
          const existingQuarter = newGrades[existingIdx][quarter] || { assignments: [] };
          const existingAssignments = existingQuarter.assignments || [];
          
          const newAssignments = [];
          if (cg.assignments && cg.assignments.length > 0) {
            cg.assignments.forEach(a => {
              const isDupe = existingAssignments.some(ea => 
                normalizeForComparison(ea.name) === normalizeForComparison(a.name)
              );
              if (!isDupe) {
                newAssignments.push({ ...a, dateAdded: now, id: Date.now() + Math.random() });
              }
            });
          }
          
          newGrades[existingIdx] = {
            ...newGrades[existingIdx],
            [quarter]: {
              overall: cg.overallGrade,
              letterGrade: cg.letterGrade,
              assessmentWeight: cg.assessmentWeight || 55,
              hwcwWeight: cg.hwcwWeight || 45,
              assignments: [...existingAssignments, ...newAssignments]
            },
            lastUpdated: now
          };
        } else {
          const assignments = (cg.assignments || []).map(a => ({
            ...a, dateAdded: now, id: Date.now() + Math.random()
          }));
          
          newGrades.push({
            id: Date.now() + Math.random(),
            subject: cg.subject,
            q1: null, q2: null, q3: null, q4: null,
            [quarter]: {
              overall: cg.overallGrade,
              letterGrade: cg.letterGrade,
              assessmentWeight: cg.assessmentWeight || 55,
              hwcwWeight: cg.hwcwWeight || 45,
              assignments: assignments
            },
            lastUpdated: now
          });
        }
      });
    }
    
    setGrades(newGrades);
    setTasks(newTasks);
    setEvents(newEvents);
    saveToFirebase({ grades: newGrades, tasks: newTasks, events: newEvents });
    
    setImportData(null);
    setShowImport(false);
  };

  const filteredTasks = activeFilter === 'all' 
    ? tasks.filter(t => !t.completed)
    : tasks.filter(t => t.category === activeFilter && !t.completed);

  const completedTasks = tasks.filter(t => t.completed);

  const formatDueDate = (dateStr) => {
    if (!dateStr) return '';
    const date = new Date(dateStr + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    if (date.getTime() === today.getTime()) return 'Today';
    if (date.getTime() === tomorrow.getTime()) return 'Tomorrow';
    if (date < today) return 'Overdue';
    return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  };

  const isOverdue = (dateStr) => {
    if (!dateStr) return false;
    const date = new Date(dateStr + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return date < today;
  };

  // Calendar helpers
  const getDaysInMonth = (date) => {
    const year = date.getFullYear();
    const month = date.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startingDay = firstDay.getDay();
    return { daysInMonth, startingDay, year, month };
  };

  const getItemsForDate = (dateStr) => {
    const dayTasks = tasks.filter(t => t.dueDate === dateStr && !t.completed);
    const dayEvents = events.filter(e => e.date === dateStr);
    return { tasks: dayTasks, events: dayEvents };
  };

  const formatDateStr = (year, month, day) => {
    return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  };

  const renderCalendar = () => {
    const { daysInMonth, startingDay, year, month } = getDaysInMonth(calendarMonth);
    const days = [];
    const today = new Date();
    const todayStr = formatDateStr(today.getFullYear(), today.getMonth(), today.getDate());
    
    for (let i = 0; i < startingDay; i++) {
      days.push(
        <div key={`empty-${i}`} style={{ 
          padding: '8px', minHeight: '80px', background: 'rgba(15, 23, 42, 0.15)', borderRadius: '8px'
        }}></div>
      );
    }
    
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = formatDateStr(year, month, day);
      const { tasks: dayTasks, events: dayEvents } = getItemsForDate(dateStr);
      const isToday = dateStr === todayStr;
      
      days.push(
        <div key={`day-${day}`} style={{
          padding: '8px', minHeight: '80px', maxHeight: '100px', overflow: 'hidden',
          background: isToday ? 'rgba(59, 130, 246, 0.1)' : 'rgba(15, 23, 42, 0.3)',
          borderRadius: '8px',
          border: isToday ? '1px solid rgba(59, 130, 246, 0.3)' : '1px solid rgba(148, 163, 184, 0.1)'
        }}>
          <div style={{ fontSize: '14px', fontWeight: isToday ? '700' : '500', color: isToday ? '#60A5FA' : '#94A3B8', marginBottom: '4px' }}>
            {day}
          </div>
          {dayTasks.slice(0, 2).map(t => (
            <div key={t.id} title={t.title} style={{
              fontSize: '11px', padding: '2px 6px', marginBottom: '2px', borderRadius: '4px',
              background: categories.find(c => c.id === t.category)?.color + '33',
              color: categories.find(c => c.id === t.category)?.color,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%', cursor: 'pointer'
            }}>
              {t.title.length > 20 ? t.title.substring(0, 20) + '...' : t.title}
            </div>
          ))}
          {dayEvents.slice(0, 2).map(e => (
            <div key={e.id} title={e.title} style={{
              fontSize: '11px', padding: '2px 6px', marginBottom: '2px', borderRadius: '4px',
              background: 'rgba(236, 72, 153, 0.2)', color: '#EC4899',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%', cursor: 'pointer'
            }}>
              {e.title.length > 18 ? '📅 ' + e.title.substring(0, 15) + '...' : '📅 ' + e.title}
            </div>
          ))}
          {(dayTasks.length + dayEvents.length) > 2 && (
            <div style={{ fontSize: '10px', color: '#64748B' }}>+{dayTasks.length + dayEvents.length - 2} more</div>
          )}
        </div>
      );
    }
    
    const totalCells = days.length;
    const remainingCells = (7 - (totalCells % 7)) % 7;
    for (let i = 0; i < remainingCells; i++) {
      days.push(
        <div key={`empty-end-${i}`} style={{ 
          padding: '8px', minHeight: '80px', background: 'rgba(15, 23, 42, 0.15)', borderRadius: '8px'
        }}></div>
      );
    }
    
    return days;
  };

  if (isLoading) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center'
      }}>
        <div style={{ color: '#94A3B8', fontSize: '18px' }}>Loading...</div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', padding: '24px' }}>
      {/* Header */}
      <div style={{
        maxWidth: '1000px', margin: '0 auto 24px',
        display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px'
      }}>
        <div>
          <h1 style={{
            fontFamily: "'Space Mono', monospace", fontSize: '32px', fontWeight: '700', margin: '0 0 4px',
            background: 'linear-gradient(90deg, #60A5FA, #A78BFA)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent'
          }}>
            TRISTAN
          </h1>
          <p style={{ color: '#64748B', margin: 0, fontSize: '14px' }}>Get it done. Level up.</p>
        </div>
        
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <div style={{
            background: 'rgba(16, 185, 129, 0.1)', border: '1px solid rgba(16, 185, 129, 0.2)',
            borderRadius: '12px', padding: '10px 16px', textAlign: 'center'
          }}>
            <div style={{ fontFamily: "'Space Mono', monospace", fontSize: '22px', color: '#10B981', fontWeight: '700' }}>{streak}</div>
            <div style={{ fontSize: '10px', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Streak</div>
          </div>
          <div style={{
            background: 'rgba(139, 92, 246, 0.1)', border: '1px solid rgba(139, 92, 246, 0.2)',
            borderRadius: '12px', padding: '10px 16px', textAlign: 'center'
          }}>
            <div style={{ fontFamily: "'Space Mono', monospace", fontSize: '22px', color: '#A78BFA', fontWeight: '700' }}>{totalCompleted}</div>
            <div style={{ fontSize: '10px', color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Completed</div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' }}>
          <button onClick={() => setShowFactsPaste(true)} style={{
            padding: '10px 16px', borderRadius: '10px', border: '1px solid rgba(16, 185, 129, 0.3)',
            background: 'rgba(16, 185, 129, 0.1)', color: '#10B981', cursor: 'pointer', fontSize: '13px', fontWeight: '600'
          }}>
            📋 Paste from FACTS
          </button>
          <button onClick={() => setShowArchive(true)} style={{
            padding: '10px 16px', borderRadius: '10px', border: '1px solid rgba(148, 163, 184, 0.2)',
            background: 'rgba(30, 41, 59, 0.5)', color: '#94A3B8', cursor: 'pointer', fontSize: '13px', fontWeight: '500'
          }}>
            📦 Archive ({archivedTasks.length})
          </button>
          <div style={{ flex: 1 }}></div>
          <button onClick={() => setActiveView('tasks')} style={{
            padding: '10px 16px', borderRadius: '10px', border: 'none',
            background: activeView === 'tasks' ? '#3B82F6' : 'rgba(30, 41, 59, 0.5)',
            color: activeView === 'tasks' ? 'white' : '#94A3B8', cursor: 'pointer', fontSize: '13px', fontWeight: '500'
          }}>
            📋 Tasks
          </button>
          <button onClick={() => setActiveView('calendar')} style={{
            padding: '10px 16px', borderRadius: '10px', border: 'none',
            background: activeView === 'calendar' ? '#3B82F6' : 'rgba(30, 41, 59, 0.5)',
            color: activeView === 'calendar' ? 'white' : '#94A3B8', cursor: 'pointer', fontSize: '13px', fontWeight: '500'
          }}>
            📅 Calendar
          </button>
        </div>

        {/* Grades Section */}
        <div style={{
          background: 'rgba(30, 41, 59, 0.5)', borderRadius: '16px', padding: '20px', marginBottom: '20px',
          border: '1px solid rgba(148, 163, 184, 0.1)'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', flexWrap: 'wrap', gap: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <h2 style={{ margin: 0, fontSize: '16px', fontWeight: '600', color: '#94A3B8' }}>📊 Class Grades</h2>
              <div style={{ display: 'flex', gap: '4px' }}>
                {['q1', 'q2', 'q3', 'q4'].map(q => (
                  <button key={q} onClick={() => setViewQuarter(q)} style={{
                    padding: '4px 10px', borderRadius: '6px', border: 'none',
                    background: viewQuarter === q ? '#3B82F6' : 'rgba(15, 23, 42, 0.5)',
                    color: viewQuarter === q ? 'white' : '#64748B', cursor: 'pointer', fontSize: '11px', fontWeight: '600'
                  }}>
                    Q{q.charAt(1)}
                  </button>
                ))}
              </div>
              {viewQuarter === currentQuarter && (
                <span style={{ fontSize: '10px', color: '#10B981', fontWeight: '500' }}>● Current</span>
              )}
            </div>
            <button onClick={() => setShowAddGrade(true)} style={{
              background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.3)',
              color: '#60A5FA', padding: '6px 12px', borderRadius: '8px', cursor: 'pointer', fontSize: '12px', fontWeight: '500'
            }}>
              + Update
            </button>
          </div>
          
          {grades.length === 0 ? (
            <p style={{ color: '#64748B', fontSize: '14px', margin: 0 }}>No grades yet. Add grades manually using the + Update button.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {grades.map(grade => {
                const quarterData = grade[viewQuarter];
                const overallGrade = quarterData?.overall;
                const letterGrade = quarterData?.letterGrade;
                const assignments = quarterData?.assignments || [];
                const assessmentWeight = quarterData?.assessmentWeight || 55;
                const hwcwWeight = quarterData?.hwcwWeight || 45;
                const isExpanded = expandedClass === grade.id;
                
                const assessments = assignments.filter(a => a.category === 'assessment');
                const hwcw = assignments.filter(a => a.category === 'hwcw' || a.category === 'homework' || a.category === 'classwork');
                
                return (
                  <div key={grade.id}>
                    <div onClick={() => setExpandedClass(isExpanded ? null : grade.id)} style={{
                      background: 'rgba(15, 23, 42, 0.5)',
                      borderRadius: isExpanded ? '10px 10px 0 0' : '10px',
                      padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      cursor: 'pointer',
                      border: `1px solid ${overallGrade ? getGradeColor(overallGrade) + '33' : 'rgba(148, 163, 184, 0.2)'}`,
                      borderBottom: isExpanded ? 'none' : undefined
                    }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span style={{ color: '#64748B', fontSize: '12px' }}>{isExpanded ? '▼' : '▶'}</span>
                        <div>
                          <div style={{ fontSize: '14px', fontWeight: '600', color: '#E2E8F0' }}>{grade.subject}</div>
                          <div style={{ fontSize: '11px', color: '#64748B' }}>
                            Assessments {assessmentWeight}% • HW/CW {hwcwWeight}%
                          </div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {overallGrade ? (
                          <>
                            <div style={{ fontFamily: "'Space Mono', monospace", fontSize: '24px', color: getGradeColor(overallGrade), fontWeight: '700' }}>
                              {overallGrade}%
                            </div>
                            {letterGrade && (
                              <div style={{ fontSize: '12px', color: '#64748B', background: 'rgba(148, 163, 184, 0.1)', padding: '2px 8px', borderRadius: '4px' }}>
                                {letterGrade}
                              </div>
                            )}
                          </>
                        ) : (
                          <div style={{ fontSize: '14px', color: '#475569', fontStyle: 'italic' }}>No grade</div>
                        )}
                        <button onClick={(e) => { e.stopPropagation(); deleteGrade(grade.id); }} style={{
                          background: 'none', border: 'none', color: '#64748B', cursor: 'pointer', fontSize: '14px', padding: '4px', opacity: 0.5
                        }}>×</button>
                      </div>
                    </div>
                    
                    {isExpanded && (
                      <div style={{
                        background: 'rgba(15, 23, 42, 0.3)', borderRadius: '0 0 10px 10px', padding: '16px',
                        border: `1px solid ${overallGrade ? getGradeColor(overallGrade) + '33' : 'rgba(148, 163, 184, 0.2)'}`,
                        borderTop: 'none'
                      }}>
                        {assignments.length === 0 ? (
                          <p style={{ color: '#64748B', fontSize: '13px', margin: 0, textAlign: 'center' }}>
                            No individual assignments imported yet
                          </p>
                        ) : (
                          <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
                            <div style={{ flex: 1, minWidth: '200px' }}>
                              <div style={{ fontSize: '12px', color: '#94A3B8', fontWeight: '600', marginBottom: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <span>📝 Assessments ({assessmentWeight}%)</span>
                                {assessments.length > 0 && (
                                  <span style={{ fontFamily: "'Space Mono', monospace", color: getGradeColor(Math.round(assessments.reduce((sum, a) => sum + parseFloat(a.grade || 0), 0) / assessments.length)), fontWeight: '700' }}>
                                    Avg: {Math.round(assessments.reduce((sum, a) => sum + parseFloat(a.grade || 0), 0) / assessments.length)}%
                                  </span>
                                )}
                              </div>
                              {assessments.length === 0 ? (
                                <p style={{ color: '#475569', fontSize: '12px', fontStyle: 'italic' }}>None</p>
                              ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                  {assessments.map(a => {
                                    const isNew = a.dateAdded && (Date.now() - new Date(a.dateAdded).getTime()) < 2 * 24 * 60 * 60 * 1000;
                                    return (
                                      <div key={a.id} style={{
                                        display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px',
                                        background: isNew ? 'rgba(16, 185, 129, 0.1)' : 'rgba(15, 23, 42, 0.5)',
                                        borderRadius: '6px', border: isNew ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid transparent'
                                      }}>
                                        <span style={{ fontSize: '12px', color: '#E2E8F0' }} title={a.name}>
                                          {a.name.length > 25 ? a.name.substring(0, 25) + '...' : a.name}
                                        </span>
                                        <span style={{ fontFamily: "'Space Mono', monospace", fontSize: '13px', fontWeight: '600', color: getGradeColor(a.grade) }}>
                                          {a.grade}%
                                        </span>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                            
                            <div style={{ flex: 1, minWidth: '200px' }}>
                              <div style={{ fontSize: '12px', color: '#94A3B8', fontWeight: '600', marginBottom: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <span>📚 HW/CW ({hwcwWeight}%)</span>
                                {hwcw.length > 0 && (
                                  <span style={{ fontFamily: "'Space Mono', monospace", color: getGradeColor(Math.round(hwcw.reduce((sum, a) => sum + parseFloat(a.grade || 0), 0) / hwcw.length)), fontWeight: '700' }}>
                                    Avg: {Math.round(hwcw.reduce((sum, a) => sum + parseFloat(a.grade || 0), 0) / hwcw.length)}%
                                  </span>
                                )}
                              </div>
                              {hwcw.length === 0 ? (
                                <p style={{ color: '#475569', fontSize: '12px', fontStyle: 'italic' }}>None</p>
                              ) : (
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                  {hwcw.map(a => {
                                    const isNew = a.dateAdded && (Date.now() - new Date(a.dateAdded).getTime()) < 2 * 24 * 60 * 60 * 1000;
                                    return (
                                      <div key={a.id} style={{
                                        display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 10px',
                                        background: isNew ? 'rgba(16, 185, 129, 0.1)' : 'rgba(15, 23, 42, 0.5)',
                                        borderRadius: '6px', border: isNew ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid transparent'
                                      }}>
                                        <span style={{ fontSize: '12px', color: '#E2E8F0' }} title={a.name}>
                                          {a.name.length > 25 ? a.name.substring(0, 25) + '...' : a.name}
                                        </span>
                                        <span style={{ fontFamily: "'Space Mono', monospace", fontSize: '13px', fontWeight: '600', color: getGradeColor(a.grade) }}>
                                          {a.grade}%
                                        </span>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
        
        {/* Recently Added Grades */}
        {(() => {
          const twoDaysAgo = Date.now() - (2 * 24 * 60 * 60 * 1000);
          const recentGrades = [];
          
          grades.forEach(g => {
            const quarterData = g[viewQuarter];
            if (quarterData?.assignments) {
              quarterData.assignments.forEach(a => {
                if (a.dateAdded && new Date(a.dateAdded).getTime() > twoDaysAgo) {
                  recentGrades.push({ ...a, subject: g.subject });
                }
              });
            }
          });
          
          if (recentGrades.length === 0) return null;
          
          recentGrades.sort((a, b) => new Date(b.dateAdded) - new Date(a.dateAdded));
          
          return (
            <div style={{
              background: 'rgba(16, 185, 129, 0.05)', borderRadius: '16px', padding: '16px 20px', marginBottom: '20px',
              border: '1px solid rgba(16, 185, 129, 0.2)'
            }}>
              <h3 style={{ margin: '0 0 12px', fontSize: '14px', fontWeight: '600', color: '#10B981' }}>
                🆕 Recently Added Grades
              </h3>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                {recentGrades.map((g, i) => (
                  <div key={i} style={{
                    background: 'rgba(15, 23, 42, 0.5)', padding: '8px 12px', borderRadius: '8px',
                    display: 'flex', alignItems: 'center', gap: '8px'
                  }}>
                    <span style={{ fontSize: '11px', color: '#94A3B8' }}>{g.subject}:</span>
                    <span style={{ fontSize: '12px', color: '#E2E8F0' }} title={g.name}>
                      {g.name.length > 20 ? g.name.substring(0, 20) + '...' : g.name}
                    </span>
                    <span style={{ fontFamily: "'Space Mono', monospace", fontSize: '13px', fontWeight: '700', color: getGradeColor(g.grade) }}>
                      {g.grade}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          );
        })()}

        {/* Calendar View */}
        {activeView === 'calendar' && (
          <div style={{
            background: 'rgba(30, 41, 59, 0.5)', borderRadius: '16px', padding: '20px', marginBottom: '20px',
            border: '1px solid rgba(148, 163, 184, 0.1)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <button onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1))} style={{
                background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.2)',
                color: '#60A5FA', padding: '8px 12px', borderRadius: '8px', cursor: 'pointer', fontSize: '14px'
              }}>←</button>
              <h2 style={{ margin: 0, fontSize: '18px', fontWeight: '600' }}>
                {calendarMonth.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
              </h2>
              <button onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1))} style={{
                background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.2)',
                color: '#60A5FA', padding: '8px 12px', borderRadius: '8px', cursor: 'pointer', fontSize: '14px'
              }}>→</button>
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px', marginBottom: '4px' }}>
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                <div key={day} style={{ textAlign: 'center', fontSize: '12px', color: '#64748B', padding: '8px' }}>{day}</div>
              ))}
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '4px' }}>
              {renderCalendar()}
            </div>
            
            <button onClick={() => setShowAddEvent(true)} style={{
              width: '100%', padding: '12px', marginTop: '16px',
              background: 'rgba(236, 72, 153, 0.1)', border: '1px dashed rgba(236, 72, 153, 0.3)',
              borderRadius: '10px', color: '#EC4899', cursor: 'pointer', fontSize: '14px', fontWeight: '500'
            }}>+ Add Event</button>
          </div>
        )}

        {/* Tasks View */}
        {activeView === 'tasks' && (
          <>
            <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
              <button onClick={() => setActiveFilter('all')} style={{
                padding: '8px 14px', borderRadius: '20px', border: 'none',
                background: activeFilter === 'all' ? '#3B82F6' : 'rgba(30, 41, 59, 0.5)',
                color: activeFilter === 'all' ? 'white' : '#94A3B8', cursor: 'pointer', fontSize: '12px', fontWeight: '500'
              }}>All</button>
              {categories.map(cat => (
                <button key={cat.id} onClick={() => setActiveFilter(cat.id)} style={{
                  padding: '8px 14px', borderRadius: '20px', border: 'none',
                  background: activeFilter === cat.id ? cat.color : 'rgba(30, 41, 59, 0.5)',
                  color: activeFilter === cat.id ? 'white' : '#94A3B8', cursor: 'pointer', fontSize: '12px', fontWeight: '500'
                }}>{cat.icon} {cat.label}</button>
              ))}
            </div>

            <button onClick={() => setShowAddTask(true)} style={{
              width: '100%', padding: '14px', marginBottom: '16px',
              background: 'rgba(59, 130, 246, 0.1)', border: '2px dashed rgba(59, 130, 246, 0.3)',
              borderRadius: '12px', color: '#60A5FA', cursor: 'pointer', fontSize: '14px', fontWeight: '500'
            }}>+ Add New Task</button>

            <div style={{ marginBottom: '24px' }}>
              {filteredTasks.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '32px', color: '#64748B' }}>
                  <div style={{ fontSize: '40px', marginBottom: '8px' }}>🎉</div>
                  <p style={{ margin: 0, fontSize: '14px' }}>
                    {tasks.filter(t => !t.completed).length === 0 ? "All caught up!" : "No tasks in this category."}
                  </p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {filteredTasks.map(task => {
                    const cat = categories.find(c => c.id === task.category);
                    return (
                      <div key={task.id} style={{
                        background: 'rgba(30, 41, 59, 0.5)', borderRadius: '12px', padding: '14px',
                        border: `1px solid ${isOverdue(task.dueDate) ? 'rgba(239, 68, 68, 0.3)' : 'rgba(148, 163, 184, 0.1)'}`,
                        display: 'flex', alignItems: 'flex-start', gap: '12px'
                      }}>
                        <button onClick={() => toggleTask(task.id)} style={{
                          width: '22px', height: '22px', borderRadius: '6px',
                          border: `2px solid ${cat?.color || '#64748B'}`,
                          background: 'transparent', cursor: 'pointer', flexShrink: 0, marginTop: '2px'
                        }} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                            <span style={{ fontSize: '14px', fontWeight: '500' }}>{task.title}</span>
                            <span style={{
                              fontSize: '10px', padding: '2px 8px', borderRadius: '10px',
                              background: `${cat?.color}22`, color: cat?.color
                            }}>{cat?.icon} {cat?.label}</span>
                          </div>
                          {task.notes && <p style={{ margin: '4px 0 0', fontSize: '12px', color: '#64748B' }}>{task.notes}</p>}
                          {task.dueDate && (
                            <div style={{ marginTop: '6px', fontSize: '11px', color: isOverdue(task.dueDate) ? '#EF4444' : '#64748B' }}>
                              📅 {formatDueDate(task.dueDate)}
                            </div>
                          )}
                        </div>
                        <button onClick={() => deleteTask(task.id)} style={{
                          background: 'none', border: 'none', color: '#64748B', cursor: 'pointer', fontSize: '16px', padding: '0 4px', opacity: 0.5
                        }}>×</button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {completedTasks.length > 0 && (
              <div>
                <h3 style={{ fontSize: '13px', color: '#64748B', marginBottom: '10px', fontWeight: '500' }}>
                  ✓ Recently Completed ({completedTasks.length})
                </h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {completedTasks.slice(0, 3).map(task => (
                    <div key={task.id} onClick={() => toggleTask(task.id)} style={{
                      background: 'rgba(30, 41, 59, 0.3)', borderRadius: '10px', padding: '10px 14px',
                      display: 'flex', alignItems: 'center', gap: '10px', opacity: 0.6, cursor: 'pointer'
                    }}>
                      <div style={{
                        width: '18px', height: '18px', borderRadius: '5px', background: '#10B981',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '10px'
                      }}>✓</div>
                      <span style={{ textDecoration: 'line-through', fontSize: '13px', flex: 1 }}>{task.title}</span>
                      <span style={{ fontSize: '10px', color: '#64748B' }}>click to undo</span>
                    </div>
                  ))}
                </div>
                <p style={{ fontSize: '11px', color: '#475569', marginTop: '8px' }}>
                  Completed tasks auto-archive after 24 hours
                </p>
              </div>
            )}
          </>
        )}

        {/* Modals */}
        {showAddGrade && (
          <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px'
          }}>
            <div style={{
              background: '#1E293B', borderRadius: '16px', padding: '24px', width: '100%', maxWidth: '400px',
              border: '1px solid rgba(148, 163, 184, 0.2)'
            }}>
              <h3 style={{ margin: '0 0 20px', fontSize: '18px' }}>Update Grade</h3>
              <input type="text" placeholder="Subject" value={newGrade.subject}
                onChange={(e) => setNewGrade({ ...newGrade, subject: e.target.value })}
                style={{
                  width: '100%', padding: '12px', marginBottom: '12px', background: '#0F172A',
                  border: '1px solid rgba(148, 163, 184, 0.2)', borderRadius: '8px', color: '#E2E8F0', fontSize: '14px', boxSizing: 'border-box'
                }}
              />
              <div style={{ marginBottom: '12px' }}>
                <div style={{ fontSize: '12px', color: '#64748B', marginBottom: '6px' }}>Quarter</div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  {['q1', 'q2', 'q3', 'q4'].map(q => (
                    <button key={q} type="button" onClick={() => setNewGrade({ ...newGrade, quarter: q })} style={{
                      flex: 1, padding: '10px', borderRadius: '8px', border: 'none',
                      background: newGrade.quarter === q ? '#3B82F6' : '#0F172A',
                      color: newGrade.quarter === q ? 'white' : '#64748B', cursor: 'pointer', fontSize: '13px', fontWeight: '600'
                    }}>Q{q.charAt(1)}</button>
                  ))}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '12px', marginBottom: '20px' }}>
                <input type="number" placeholder="Grade %" value={newGrade.grade}
                  onChange={(e) => setNewGrade({ ...newGrade, grade: e.target.value })}
                  style={{
                    flex: 1, padding: '12px', background: '#0F172A',
                    border: '1px solid rgba(148, 163, 184, 0.2)', borderRadius: '8px', color: '#E2E8F0', fontSize: '14px'
                  }}
                />
                <input type="text" placeholder="Letter" value={newGrade.letterGrade}
                  onChange={(e) => setNewGrade({ ...newGrade, letterGrade: e.target.value })}
                  style={{
                    width: '80px', padding: '12px', background: '#0F172A',
                    border: '1px solid rgba(148, 163, 184, 0.2)', borderRadius: '8px', color: '#E2E8F0', fontSize: '14px'
                  }}
                />
              </div>
              <div style={{ display: 'flex', gap: '12px' }}>
                <button onClick={() => setShowAddGrade(false)} style={{
                  flex: 1, padding: '12px', background: 'transparent', border: '1px solid rgba(148, 163, 184, 0.2)',
                  borderRadius: '8px', color: '#94A3B8', cursor: 'pointer', fontSize: '14px'
                }}>Cancel</button>
                <button onClick={addGrade} style={{
                  flex: 1, padding: '12px', background: '#3B82F6', border: 'none',
                  borderRadius: '8px', color: 'white', cursor: 'pointer', fontSize: '14px', fontWeight: '600'
                }}>Save</button>
              </div>
            </div>
          </div>
        )}

        {showAddTask && (
          <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px'
          }}>
            <div style={{
              background: '#1E293B', borderRadius: '16px', padding: '24px', width: '100%', maxWidth: '450px',
              border: '1px solid rgba(148, 163, 184, 0.2)'
            }}>
              <h3 style={{ margin: '0 0 20px', fontSize: '18px' }}>Add Task</h3>
              <input type="text" placeholder="What needs to be done?" value={newTask.title}
                onChange={(e) => setNewTask({ ...newTask, title: e.target.value })}
                style={{
                  width: '100%', padding: '12px', marginBottom: '12px', background: '#0F172A',
                  border: '1px solid rgba(148, 163, 184, 0.2)', borderRadius: '8px', color: '#E2E8F0', fontSize: '14px', boxSizing: 'border-box'
                }}
              />
              <div style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
                <select value={newTask.category} onChange={(e) => setNewTask({ ...newTask, category: e.target.value })}
                  style={{
                    flex: 1, padding: '12px', background: '#0F172A',
                    border: '1px solid rgba(148, 163, 184, 0.2)', borderRadius: '8px', color: '#E2E8F0', fontSize: '14px'
                  }}>
                  {categories.map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.icon} {cat.label}</option>
                  ))}
                </select>
                <input type="date" value={newTask.dueDate}
                  onChange={(e) => setNewTask({ ...newTask, dueDate: e.target.value })}
                  style={{
                    flex: 1, padding: '12px', background: '#0F172A',
                    border: '1px solid rgba(148, 163, 184, 0.2)', borderRadius: '8px', color: '#E2E8F0', fontSize: '14px'
                  }}
                />
              </div>
              <textarea placeholder="Notes (optional)" value={newTask.notes}
                onChange={(e) => setNewTask({ ...newTask, notes: e.target.value })}
                style={{
                  width: '100%', padding: '12px', marginBottom: '20px', background: '#0F172A',
                  border: '1px solid rgba(148, 163, 184, 0.2)', borderRadius: '8px', color: '#E2E8F0',
                  fontSize: '14px', minHeight: '60px', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit'
                }}
              />
              <div style={{ display: 'flex', gap: '12px' }}>
                <button onClick={() => setShowAddTask(false)} style={{
                  flex: 1, padding: '12px', background: 'transparent', border: '1px solid rgba(148, 163, 184, 0.2)',
                  borderRadius: '8px', color: '#94A3B8', cursor: 'pointer', fontSize: '14px'
                }}>Cancel</button>
                <button onClick={addTask} style={{
                  flex: 1, padding: '12px', background: '#3B82F6', border: 'none',
                  borderRadius: '8px', color: 'white', cursor: 'pointer', fontSize: '14px', fontWeight: '600'
                }}>Add</button>
              </div>
            </div>
          </div>
        )}

        {showAddEvent && (
          <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px'
          }}>
            <div style={{
              background: '#1E293B', borderRadius: '16px', padding: '24px', width: '100%', maxWidth: '400px',
              border: '1px solid rgba(148, 163, 184, 0.2)'
            }}>
              <h3 style={{ margin: '0 0 20px', fontSize: '18px' }}>Add Event</h3>
              <input type="text" placeholder="Event name" value={newEvent.title}
                onChange={(e) => setNewEvent({ ...newEvent, title: e.target.value })}
                style={{
                  width: '100%', padding: '12px', marginBottom: '12px', background: '#0F172A',
                  border: '1px solid rgba(148, 163, 184, 0.2)', borderRadius: '8px', color: '#E2E8F0', fontSize: '14px', boxSizing: 'border-box'
                }}
              />
              <div style={{ display: 'flex', gap: '12px', marginBottom: '12px' }}>
                <input type="date" value={newEvent.date}
                  onChange={(e) => setNewEvent({ ...newEvent, date: e.target.value })}
                  style={{
                    flex: 1, padding: '12px', background: '#0F172A',
                    border: '1px solid rgba(148, 163, 184, 0.2)', borderRadius: '8px', color: '#E2E8F0', fontSize: '14px'
                  }}
                />
                <input type="time" value={newEvent.time}
                  onChange={(e) => setNewEvent({ ...newEvent, time: e.target.value })}
                  style={{
                    width: '120px', padding: '12px', background: '#0F172A',
                    border: '1px solid rgba(148, 163, 184, 0.2)', borderRadius: '8px', color: '#E2E8F0', fontSize: '14px'
                  }}
                />
              </div>
              <textarea placeholder="Notes (optional)" value={newEvent.notes}
                onChange={(e) => setNewEvent({ ...newEvent, notes: e.target.value })}
                style={{
                  width: '100%', padding: '12px', marginBottom: '20px', background: '#0F172A',
                  border: '1px solid rgba(148, 163, 184, 0.2)', borderRadius: '8px', color: '#E2E8F0',
                  fontSize: '14px', minHeight: '60px', resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit'
                }}
              />
              <div style={{ display: 'flex', gap: '12px' }}>
                <button onClick={() => setShowAddEvent(false)} style={{
                  flex: 1, padding: '12px', background: 'transparent', border: '1px solid rgba(148, 163, 184, 0.2)',
                  borderRadius: '8px', color: '#94A3B8', cursor: 'pointer', fontSize: '14px'
                }}>Cancel</button>
                <button onClick={addEvent} style={{
                  flex: 1, padding: '12px', background: '#EC4899', border: 'none',
                  borderRadius: '8px', color: 'white', cursor: 'pointer', fontSize: '14px', fontWeight: '600'
                }}>Add Event</button>
              </div>
            </div>
          </div>
        )}

        {showArchive && (
          <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px'
          }}>
            <div style={{
              background: '#1E293B', borderRadius: '16px', padding: '24px', width: '100%', maxWidth: '500px',
              maxHeight: '70vh', overflow: 'auto', border: '1px solid rgba(148, 163, 184, 0.2)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h3 style={{ margin: 0, fontSize: '18px' }}>📦 Archived Tasks</h3>
                <button onClick={() => setShowArchive(false)} style={{
                  background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', fontSize: '20px'
                }}>×</button>
              </div>
              
              {archivedTasks.length === 0 ? (
                <p style={{ color: '#64748B', textAlign: 'center', padding: '20px' }}>No archived tasks yet.</p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {archivedTasks.map(task => (
                    <div key={task.id} style={{
                      background: 'rgba(15, 23, 42, 0.5)', borderRadius: '10px', padding: '12px',
                      display: 'flex', alignItems: 'center', gap: '10px'
                    }}>
                      <div style={{
                        width: '18px', height: '18px', borderRadius: '5px', background: '#10B981',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: '10px'
                      }}>✓</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: '13px' }}>{task.title}</div>
                        <div style={{ fontSize: '11px', color: '#64748B' }}>
                          Completed {new Date(task.completedAt).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              
              {archivedTasks.length > 0 && (
                <button onClick={() => {
                  setArchivedTasks([]);
                  saveToFirebase({ archivedTasks: [] });
                  setShowArchive(false);
                }} style={{
                  width: '100%', padding: '12px', marginTop: '16px',
                  background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)',
                  borderRadius: '8px', color: '#EF4444', cursor: 'pointer', fontSize: '13px'
                }}>Clear Archive</button>
              )}
            </div>
          </div>
        )}

        {/* Paste Import Modal */}
        {showPasteImport && (
          <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px'
          }}>
            <div style={{
              background: '#1E293B', borderRadius: '16px', padding: '24px', width: '100%', maxWidth: '500px',
              border: '1px solid rgba(148, 163, 184, 0.2)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h3 style={{ margin: 0, fontSize: '18px' }}>📥 Import from Claude</h3>
                <button onClick={() => { setShowPasteImport(false); setPasteData(''); }} style={{
                  background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', fontSize: '20px'
                }}>×</button>
              </div>
              
              <p style={{ color: '#94A3B8', fontSize: '14px', marginBottom: '16px' }}>
                In Claude, click "📋 Copy Data for App", then paste below:
              </p>
              
              <textarea
                value={pasteData}
                onChange={(e) => setPasteData(e.target.value)}
                placeholder="Paste data here..."
                style={{
                  width: '100%', height: '150px', padding: '12px', background: '#0F172A',
                  border: '1px solid rgba(148, 163, 184, 0.2)', borderRadius: '8px', color: '#E2E8F0',
                  fontSize: '12px', fontFamily: 'monospace', resize: 'vertical', boxSizing: 'border-box'
                }}
              />
              
              <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
                <button onClick={() => { setShowPasteImport(false); setPasteData(''); }} style={{
                  flex: 1, padding: '12px', background: 'transparent', border: '1px solid rgba(148, 163, 184, 0.2)',
                  borderRadius: '8px', color: '#94A3B8', cursor: 'pointer', fontSize: '14px'
                }}>Cancel</button>
                <button onClick={() => {
                  try {
                    const data = JSON.parse(pasteData);
                    if (data.tasks) setTasks(data.tasks);
                    if (data.archivedTasks) setArchivedTasks(data.archivedTasks);
                    if (data.grades) setGrades(data.grades);
                    if (data.events) setEvents(data.events);
                    if (data.streak !== undefined) setStreak(data.streak);
                    if (data.totalCompleted !== undefined) setTotalCompleted(data.totalCompleted);
                    
                    saveToFirebase({
                      tasks: data.tasks || tasks,
                      archivedTasks: data.archivedTasks || archivedTasks,
                      grades: data.grades || grades,
                      events: data.events || events,
                      streak: data.streak !== undefined ? data.streak : streak,
                      totalCompleted: data.totalCompleted !== undefined ? data.totalCompleted : totalCompleted
                    });
                    
                    setShowPasteImport(false);
                    setPasteData('');
                    alert('✓ Data imported successfully!');
                  } catch (e) {
                    alert('Error: Invalid data format. Make sure you copied the full data from Claude.');
                  }
                }} style={{
                  flex: 1, padding: '12px', background: '#EC4899', border: 'none',
                  borderRadius: '8px', color: 'white', cursor: 'pointer', fontSize: '14px', fontWeight: '600'
                }}>Import</button>
              </div>
            </div>
          </div>
        )}

        {/* FACTS Paste Modal */}
        {showFactsPaste && (
          <div style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px'
          }}>
            <div style={{
              background: '#1E293B', borderRadius: '16px', padding: '24px', width: '100%', maxWidth: '600px',
              maxHeight: '90vh', overflow: 'auto', border: '1px solid rgba(148, 163, 184, 0.2)'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
                <h3 style={{ margin: 0, fontSize: '18px' }}>📋 Paste from FACTS</h3>
                <button onClick={() => { setShowFactsPaste(false); setFactsText(''); setFactsParsed(null); }} style={{
                  background: 'none', border: 'none', color: '#94A3B8', cursor: 'pointer', fontSize: '20px'
                }}>×</button>
              </div>
              
              <div style={{ 
                background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.2)',
                borderRadius: '8px', padding: '12px', marginBottom: '16px', fontSize: '13px', color: '#94A3B8'
              }}>
                <strong style={{ color: '#60A5FA' }}>How to use:</strong><br/>
                1. Go to FACTS Gradebook Report or Homework page<br/>
                2. Press <strong>Ctrl+A</strong> (select all) then <strong>Ctrl+C</strong> (copy)<br/>
                3. Paste below with <strong>Ctrl+V</strong>
              </div>
              
              <textarea
                value={factsText}
                onChange={(e) => {
                  setFactsText(e.target.value);
                  if (e.target.value.length > 50) {
                    setFactsParsed(parseFactsText(e.target.value));
                  } else {
                    setFactsParsed(null);
                  }
                }}
                placeholder="Paste the FACTS page content here..."
                style={{
                  width: '100%', height: '150px', padding: '12px', background: '#0F172A',
                  border: '1px solid rgba(148, 163, 184, 0.2)', borderRadius: '8px', color: '#E2E8F0',
                  fontSize: '12px', fontFamily: 'monospace', resize: 'vertical', boxSizing: 'border-box'
                }}
              />
              
              {/* Preview of parsed data */}
              {factsParsed && (
                <div style={{
                  marginTop: '16px', background: 'rgba(15, 23, 42, 0.5)', borderRadius: '8px', padding: '16px'
                }}>
                  <h4 style={{ margin: '0 0 12px', fontSize: '14px', color: '#10B981' }}>
                    ✓ Detected: {factsParsed.type === 'grades' ? 'Grades' : 'Homework'}
                  </h4>
                  
                  {factsParsed.type === 'grades' && (
                    <div style={{ fontSize: '13px' }}>
                      <div style={{ marginBottom: '8px' }}>
                        <span style={{ color: '#64748B' }}>Subject:</span>{' '}
                        <strong style={{ color: '#E2E8F0' }}>{factsParsed.subject || 'Not detected'}</strong>
                      </div>
                      <div style={{ marginBottom: '8px' }}>
                        <span style={{ color: '#64748B' }}>Quarter:</span>{' '}
                        <strong style={{ color: '#E2E8F0' }}>{factsParsed.quarter.toUpperCase()}</strong>
                      </div>
                      <div style={{ marginBottom: '8px' }}>
                        <span style={{ color: '#64748B' }}>Grade:</span>{' '}
                        <strong style={{ color: '#10B981' }}>{factsParsed.overallGrade}% {factsParsed.letterGrade}</strong>
                      </div>
                      <div style={{ marginBottom: '8px' }}>
                        <span style={{ color: '#64748B' }}>Weights:</span>{' '}
                        <span style={{ color: '#E2E8F0' }}>Assessments {factsParsed.assessmentWeight}% / HW {factsParsed.hwcwWeight}%</span>
                      </div>
                      <div>
                        <span style={{ color: '#64748B' }}>Assignments found:</span>{' '}
                        <strong style={{ color: '#E2E8F0' }}>{factsParsed.assignments.length}</strong>
                        {factsParsed.assignments.length > 0 && (
                          <div style={{ marginTop: '8px', maxHeight: '100px', overflow: 'auto' }}>
                            {factsParsed.assignments.map((a, i) => (
                              <div key={i} style={{ fontSize: '11px', color: '#94A3B8', padding: '2px 0' }}>
                                • {a.name.substring(0, 40)}{a.name.length > 40 ? '...' : ''} — {a.grade}%
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      
                      {!factsParsed.subject && (
                        <div style={{ marginTop: '12px' }}>
                          <label style={{ display: 'block', color: '#64748B', fontSize: '12px', marginBottom: '4px' }}>
                            Enter subject name:
                          </label>
                          <select
                            onChange={(e) => setFactsParsed({...factsParsed, subject: e.target.value})}
                            style={{
                              padding: '8px 12px', background: '#0F172A', border: '1px solid rgba(148, 163, 184, 0.2)',
                              borderRadius: '6px', color: '#E2E8F0', fontSize: '13px', width: '100%'
                            }}
                          >
                            <option value="">Select a subject...</option>
                            <option value="Bible">Bible</option>
                            <option value="History">History</option>
                            <option value="Language Arts">Language Arts</option>
                            <option value="Math">Math</option>
                            <option value="Science">Science</option>
                            <option value="Spanish">Spanish</option>
                          </select>
                        </div>
                      )}
                    </div>
                  )}
                  
                  {factsParsed.type === 'homework' && (
                    <div style={{ fontSize: '13px' }}>
                      <div style={{ marginBottom: '8px' }}>
                        <span style={{ color: '#64748B' }}>Assignments found:</span>{' '}
                        <strong style={{ color: '#E2E8F0' }}>{factsParsed.homeworkTasks.length}</strong>
                      </div>
                      {factsParsed.homeworkTasks.length > 0 && (
                        <div style={{ maxHeight: '150px', overflow: 'auto' }}>
                          {factsParsed.homeworkTasks.map((t, i) => (
                            <div key={i} style={{ fontSize: '11px', color: '#94A3B8', padding: '4px 0', borderBottom: '1px solid rgba(148,163,184,0.1)' }}>
                              • {t.title.substring(0, 60)}{t.title.length > 60 ? '...' : ''}
                              {t.dueDate && <span style={{ color: '#64748B' }}> (Due: {t.dueDate})</span>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  
                  {!factsParsed.type && (
                    <div style={{ color: '#F59E0B', fontSize: '13px' }}>
                      Could not detect page type. Make sure you copied the entire page.
                    </div>
                  )}
                </div>
              )}
              
              <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
                <button onClick={() => { setShowFactsPaste(false); setFactsText(''); setFactsParsed(null); }} style={{
                  flex: 1, padding: '12px', background: 'transparent', border: '1px solid rgba(148, 163, 184, 0.2)',
                  borderRadius: '8px', color: '#94A3B8', cursor: 'pointer', fontSize: '14px'
                }}>Cancel</button>
                <button 
                  onClick={importFactsData}
                  disabled={!factsParsed || (!factsParsed.subject && factsParsed.type === 'grades') || (factsParsed.type === 'homework' && factsParsed.homeworkTasks.length === 0)}
                  style={{
                    flex: 1, padding: '12px', 
                    background: factsParsed && ((factsParsed.type === 'grades' && factsParsed.subject) || (factsParsed.type === 'homework' && factsParsed.homeworkTasks.length > 0)) ? '#10B981' : '#475569', 
                    border: 'none',
                    borderRadius: '8px', color: 'white', cursor: 'pointer', fontSize: '14px', fontWeight: '600',
                    opacity: factsParsed && ((factsParsed.type === 'grades' && factsParsed.subject) || (factsParsed.type === 'homework' && factsParsed.homeworkTasks.length > 0)) ? 1 : 0.5
                  }}
                >Import</button>
              </div>
            </div>
          </div>
        )}

        <div style={{ marginTop: '32px', textAlign: 'center', color: '#475569', fontSize: '11px' }}>
          Built with 💪 for Tristan
        </div>
      </div>
    </div>
  );
}
