
import React, { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { ExamState } from './types';
import type { ShuffledQuestion, Question, WelcomeInfo, ExamStats, SessionData } from './types';
import { useQuestionBank } from './hooks/useQuestionBank';
import { shuffle } from './utils/shuffle';
import Spinner from './components/Spinner';
import { 
  CheckIcon, XIcon, ArrowLeftIcon, ArrowRightIcon, PlayIcon, 
  RefreshIcon, PaperAirplaneIcon, BookOpenIcon, TrashIcon, HomeIcon,
  ClipboardListIcon, TrophyIcon, AlertTriangleIcon, CircleIcon, CheckCircleIcon,
  DownloadIcon, KeyIcon, ServerIcon
} from './components/Icons';

const EXAM_QUESTION_COUNT = 30;
const PASSING_SCORE = 25;

// Turnstile Component
const Turnstile: React.FC<{ onVerify: (token: string) => void }> = ({ onVerify }) => {
    const ref = useRef<HTMLDivElement>(null);
    useEffect(() => {
        if (!ref.current) return;
        (window as any).turnstile.render(ref.current, {
            sitekey: '0x4AAAAAAAXdE5fB4x4829fl', // Always use this test key
            callback: onVerify,
        });
    }, [onVerify]);
    return <div ref={ref}></div>;
};


const App: React.FC = () => {
  const { questions, isLoading, error } = useQuestionBank('/tk.txt');
  const [examState, setExamState] = useState<ExamState>(ExamState.LOADING);
  const [examQuestions, setExamQuestions] = useState<ShuffledQuestion[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState<number>(0);
  const [userAnswers, setUserAnswers] = useState<Map<string, string>>(new Map());
  const [score, setScore] = useState<number>(0);
  const [examTitle, setExamTitle] = useState('模拟考试');

  // New state for session management
  const [welcomeInfo, setWelcomeInfo] = useState<WelcomeInfo | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionStats, setSessionStats] = useState<ExamStats | null>(null);
  const [sessionWrongIds, setSessionWrongIds] = useState<Set<string>>(new Set());
  
  const [loadIdInput, setLoadIdInput] = useState('');
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [isSessionLoading, setIsSessionLoading] = useState(false);
  const [sessionError, setSessionError] = useState<string | null>(null);
  
  const updateSessionState = (data: SessionData) => {
    setSessionId(data.id);
    sessionStorage.setItem('sessionId', data.id);
    try {
        setSessionWrongIds(new Set(JSON.parse(data.wrong_question_ids)));
    } catch {
        setSessionWrongIds(new Set());
    }
    setSessionStats({
      exams_taken: data.exams_taken,
      exams_passed: data.exams_passed,
      exams_failed: data.exams_failed,
    });
  };
  
  const loadSession = useCallback(async (idToLoad: string, token: string | null) => {
    setIsSessionLoading(true);
    setSessionError(null);
    try {
      const response = await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'load', sessionId: idToLoad, turnstileToken: token }),
      });
      if (!response.ok) throw new Error(await response.text());
      const data = await response.json();
      updateSessionState(data);
    } catch(e: any) {
      setSessionError(`加载会话失败: ${e.message}`);
      setSessionId(null); setSessionStats(null); setSessionWrongIds(new Set());
      sessionStorage.removeItem('sessionId');
    } finally {
      setIsSessionLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isLoading) {
      setExamState(ExamState.READY);
    }
    fetch('/api/welcome').then(res => res.json()).then(setWelcomeInfo).catch(() => {});
    const storedSessionId = sessionStorage.getItem('sessionId');
    if (storedSessionId) {
      loadSession(storedSessionId, null);
    }
  }, [isLoading, loadSession]);

  const saveSession = async (finalScore: number) => {
    const isPassed = finalScore >= PASSING_SCORE;
    const currentWrongIds = Array.from(examQuestions.filter(q => userAnswers.get(q.id) !== q.correctAnswer).map(q => q.id));

    try {
      const response = await fetch('/api/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save',
          sessionId: sessionId,
          payload: { wrongAnswerIds: currentWrongIds, result: isPassed ? 'pass' : 'fail' },
        }),
      });
      if (!response.ok) throw new Error(await response.text());
      const data = await response.json();
      updateSessionState(data);
    } catch (e: any) {
      setSessionError(`保存会话失败: ${e.message}`);
    }
  };

  const handleLoadSessionSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (loadIdInput && turnstileToken) {
      loadSession(loadIdInput.toUpperCase(), turnstileToken);
    } else {
      setSessionError("请输入ID并完成人机验证。");
    }
  };
  
  const startExam = useCallback((isReviewMode = false) => {
    let questionsToUse: Question[];
    
    if (isReviewMode) {
      if (sessionWrongIds.size === 0) { alert('错题本是空的！'); return; }
      const wrongQuestions = questions.filter(q => sessionWrongIds.has(q.id));
      if (wrongQuestions.length === 0) { alert('错题本中的题目在当前题库中不存在。'); return; }
      questionsToUse = shuffle(wrongQuestions);
      setExamTitle("错题练习");
    } else {
      if (questions.length < EXAM_QUESTION_COUNT) { alert(`题库题目数量不足 ${EXAM_QUESTION_COUNT} 道。`); return; }
      questionsToUse = shuffle(questions).slice(0, EXAM_QUESTION_COUNT);
      setExamTitle("模拟考试");
    }
    setExamQuestions(questionsToUse.map(q => ({ ...q, shuffledOptions: shuffle(q.options) })));
    setCurrentQuestionIndex(0); setUserAnswers(new Map()); setScore(0); setExamState(ExamState.IN_PROGRESS);
  }, [questions, sessionWrongIds]);

  const handleAnswerSelect = (questionId: string, answer: string) => setUserAnswers(prev => new Map(prev).set(questionId, answer));

  const handleSubmit = () => {
    let finalScore = examQuestions.reduce((acc, q) => acc + (userAnswers.get(q.id) === q.correctAnswer ? 1 : 0), 0);
    setScore(finalScore);
    setExamState(ExamState.FINISHED);
    saveSession(finalScore);
  };
  
  const handleClearWrongAnswers = async () => {
    if (window.confirm('确定要清空所有错题吗？此操作将更新您云端的记录。')) {
      if (!sessionId) { alert("没有活动的会话，无法清空。"); return; }
      try {
        const response = await fetch('/api/session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'clear', sessionId: sessionId }),
        });
        if (!response.ok) throw new Error(await response.text());
        const data = await response.json();
        updateSessionState(data);
        alert("错题本已清空！");
      } catch (e: any) { setSessionError(`清空错题失败: ${e.message}`); }
    }
  };
  
  const handleExportWrongAnswers = () => {
    const wrongQuestions = questions.filter(q => sessionWrongIds.has(q.id));
    if (wrongQuestions.length === 0) { alert("错题本是空的！"); return; }
    const fileContent = wrongQuestions.map(q => {
        const options = q.options.map((opt, i) => `[${String.fromCharCode(65 + i)}]${opt}`);
        return `[I]${q.id}\n[Q]${q.question}\n${options.join('\n')}\n[P]\n`;
    }).join('\n');
    const blob = new Blob([fileContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `wrong_answers_${sessionId || 'export'}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const currentQuestion = useMemo(() => examQuestions[currentQuestionIndex], [examQuestions, currentQuestionIndex]);

  const renderTopBar = () => (
    <div className="absolute top-0 left-0 right-0 p-4 text-center text-sm text-gray-500 bg-background/80 backdrop-blur-sm">
        {welcomeInfo && (
            <p className="mb-2">来自 {welcomeInfo.city}, {welcomeInfo.country} 的用户, 你好呀! 👋 这是来自 {welcomeInfo.colo} 数据中心的问候.</p>
        )}
        {sessionStats && sessionId && (
            <div className="flex justify-center items-center gap-4 text-xs font-medium">
                <span className="flex items-center gap-1"><KeyIcon className="w-4 h-4 text-primary"/> ID: <strong className="text-primary">{sessionId}</strong></span>
                <span>|</span>
                <span>已考: {sessionStats.exams_taken}</span>
                <span className="text-correct">成功: {sessionStats.exams_passed}</span>
                <span className="text-incorrect">失败: {sessionStats.exams_failed}</span>
            </div>
        )}
    </div>
  );

  const renderContent = () => {
    if (examState === ExamState.LOADING || isLoading) return <div className="flex flex-col items-center justify-center h-full gap-4"><Spinner /><p>正在加载题库...</p></div>;
    if (error) return <div className="flex flex-col items-center justify-center h-full text-center text-red-600 p-8 bg-red-50 rounded-2xl shadow-lg"><AlertTriangleIcon className="w-16 h-16 text-red-500" /><h2 className="text-2xl font-bold">加载错误</h2><p>{error}</p></div>;

    switch (examState) {
      case ExamState.READY:
        return (
          <div className="text-center w-full max-w-lg">
            <h1 className="text-4xl font-bold text-primary mb-2 flex items-center justify-center gap-3"><ClipboardListIcon className="w-10 h-10" />模拟考试</h1>
            <p className="text-lg text-gray-600 mb-8">每次随机抽取 {EXAM_QUESTION_COUNT} 题，答对 {PASSING_SCORE} 题及格。</p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-8">
              <button onClick={() => startExam(false)} className="px-6 py-3 bg-primary text-on-primary font-bold rounded-full shadow-lg hover:bg-primary-light transform hover:-translate-y-1 transition-all duration-300 ease-in-out focus:outline-none focus:ring-4 focus:ring-primary/50 flex items-center justify-center gap-2 w-full sm:w-auto"><PlayIcon className="w-6 h-6"/>开始考试</button>
              <button onClick={() => setExamState(ExamState.REVIEW)} disabled={sessionWrongIds.size === 0} className="px-6 py-3 bg-secondary text-on-surface font-semibold rounded-full shadow-md hover:bg-gray-300 transform hover:-translate-y-0.5 transition-all duration-300 ease-in-out focus:outline-none focus:ring-4 focus:ring-gray-400/50 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed w-full sm:w-auto"><BookOpenIcon className="w-6 h-6" />错题本 ({sessionWrongIds.size})</button>
            </div>
            <div className="bg-surface p-6 rounded-2xl shadow-md mt-6">
                <h3 className="text-lg font-semibold text-gray-700 mb-4 flex items-center justify-center gap-2"><KeyIcon className="w-5 h-5"/>继续学习?</h3>
                <form onSubmit={handleLoadSessionSubmit} className="flex flex-col items-center gap-4">
                    <input type="text" value={loadIdInput} onChange={(e) => setLoadIdInput(e.target.value)} placeholder="输入5位学习ID" className="w-full max-w-xs p-2 text-center border-2 rounded-lg focus:ring-primary focus:border-primary transition" maxLength={5} style={{textTransform: 'uppercase'}}/>
                    <Turnstile onVerify={setTurnstileToken} />
                    <button type="submit" disabled={isSessionLoading} className="px-5 py-2 bg-indigo-500 text-white font-semibold rounded-full shadow-md hover:bg-indigo-600 disabled:bg-gray-400 transition-colors flex items-center gap-2">
                        {isSessionLoading ? <><Spinner/> 加载中...</> : <>加载会话</>}
                    </button>
                    {sessionError && <p className="text-sm text-incorrect mt-2">{sessionError}</p>}
                </form>
            </div>
          </div>
        );
      
      case ExamState.REVIEW:
        const wrongQuestions = questions.filter(q => sessionWrongIds.has(q.id));
        return (
            <div className="w-full max-w-3xl mx-auto text-on-surface">
                <h1 className="text-3xl font-bold text-primary text-center mb-2">错题本</h1>
                <p className="text-center text-gray-600 mb-6">共 {wrongQuestions.length} 题</p>
                <div className="flex flex-wrap items-center justify-center gap-4 mb-8">
                    <button onClick={() => setExamState(ExamState.READY)} className="px-4 py-2 bg-gray-200 text-gray-700 font-semibold rounded-full shadow-sm hover:bg-gray-300 transition-colors flex items-center gap-2"><HomeIcon className="w-5 h-5"/> 返回主页</button>
                    <button onClick={() => startExam(true)} disabled={wrongQuestions.length === 0} className="px-4 py-2 bg-green-500 text-white font-semibold rounded-full shadow-md hover:bg-green-600 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors flex items-center gap-2"><PlayIcon className="w-5 h-5"/> 开始练习</button>
                    <button onClick={handleClearWrongAnswers} disabled={wrongQuestions.length === 0} className="px-4 py-2 bg-red-500 text-white font-semibold rounded-full shadow-md hover:bg-red-600 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors flex items-center gap-2"><TrashIcon className="w-5 h-5"/> 清空云端</button>
                    <button onClick={handleExportWrongAnswers} disabled={wrongQuestions.length === 0} className="px-4 py-2 bg-blue-500 text-white font-semibold rounded-full shadow-md hover:bg-blue-600 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors flex items-center gap-2"><DownloadIcon className="w-5 h-5"/> 导出 TXT</button>
                </div>
                <div className="space-y-4">
                    {wrongQuestions.length > 0 ? wrongQuestions.map((q, index) => (
                        <div key={q.id} className="bg-surface p-4 rounded-lg shadow-sm border-l-4 border-incorrect"><p className="font-semibold">{index + 1}. {q.question}</p><p className="text-sm mt-2 text-green-700 font-medium">正确答案: {q.correctAnswer}</p></div>
                    )) : <p className="text-center text-gray-500 py-8">错题本是空的，太棒了！</p>}
                </div>
            </div>
        );
      
      case ExamState.FINISHED:
        const isPassed = score >= PASSING_SCORE;
        const examWasReview = examQuestions.length !== EXAM_QUESTION_COUNT;
        return (
          <div className="text-center w-full max-w-3xl mx-auto">
            <h1 className="text-4xl font-bold mb-4">考试结束</h1>
            {sessionId && (
                <div className="mb-6 p-3 bg-indigo-50 border-2 border-dashed border-indigo-200 rounded-lg">
                    <p className="font-semibold text-indigo-800">你的学习ID是: <strong className="text-2xl tracking-widest mx-2 select-all">{sessionId}</strong></p>
                    <p className="text-sm text-indigo-600">请妥善保管此ID，以便下次继续学习。</p>
                </div>
            )}
            <div className={`p-6 rounded-2xl inline-block mb-6 relative overflow-hidden ${isPassed || examWasReview ? 'bg-green-100' : 'bg-red-100'}`}>
                {!examWasReview && <div className="absolute -top-8 -right-8 opacity-10">{isPassed ? <CheckIcon className="w-32 h-32 text-green-500" /> : <XIcon className="w-32 h-32 text-red-500"/>}</div>}
                <p className="text-2xl font-medium flex items-center justify-center gap-2 z-10"><TrophyIcon className="w-8 h-8 text-yellow-500" />你的得分</p>
                <p className={`text-6xl font-bold z-10 ${isPassed || examWasReview ? 'text-green-600' : 'text-red-600'}`}>{score} <span className="text-3xl text-gray-600">/ {examQuestions.length}</span></p>
                {!examWasReview && <p className={`mt-2 text-2xl font-semibold ${isPassed ? 'text-green-700' : 'text-red-700'}`}>{isPassed ? '考试成功' : '考试失败'}</p>}
            </div>
            <div className="space-y-4 text-left my-8">
              <h3 className="text-xl font-bold text-center mb-4">答题回顾</h3>
              {examQuestions.map((q, index) => {
                  const userAnswer = userAnswers.get(q.id);
                  const isCorrect = userAnswer === q.correctAnswer;
                  return (<div key={q.id} className="bg-surface p-4 rounded-lg shadow-sm border-l-4" style={{borderColor: isCorrect ? 'var(--tw-color-correct)' : 'var(--tw-color-incorrect)'}}><p className="font-semibold">{index + 1}. {q.question}</p><div className="mt-2 flex items-center gap-2">{isCorrect ? <CheckIcon className="w-5 h-5 text-correct"/> : <XIcon className="w-5 h-5 text-incorrect"/>}<p className="text-sm">你的答案: <span className={`font-medium ${isCorrect ? 'text-correct' : 'text-incorrect'}`}>{userAnswer || '未作答'}</span></p></div>{!isCorrect && <p className="text-sm mt-1 ml-7">正确答案: <span className="font-medium text-green-700">{q.correctAnswer}</span></p>}</div>);
              })}
            </div>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <button onClick={() => startExam(false)} className="px-6 py-3 bg-primary text-on-primary font-bold rounded-full shadow-lg hover:bg-primary-light transform hover:-translate-y-1 transition-all duration-300 ease-in-out focus:outline-none focus:ring-4 focus:ring-primary/50 flex items-center justify-center gap-2 w-full sm:w-auto"><RefreshIcon className="w-6 h-6"/>再试一次</button>
              <button onClick={() => setExamState(ExamState.REVIEW)} disabled={sessionWrongIds.size === 0} className="px-6 py-3 bg-secondary text-on-surface font-semibold rounded-full shadow-md hover:bg-gray-300 transform hover:-translate-y-0.5 transition-all duration-300 ease-in-out focus:outline-none focus:ring-4 focus:ring-gray-400/50 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed w-full sm:w-auto"><BookOpenIcon className="w-6 h-6" />错题本 ({sessionWrongIds.size})</button>
            </div>
          </div>
        );

      case ExamState.IN_PROGRESS:
        if (!currentQuestion) return null;
        const totalQuestions = examQuestions.length;
        return (
          <div className="w-full max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-6">
            <div className="md:col-span-3">
              <div className="mb-4">
                <h1 className="text-2xl font-bold text-center text-primary mb-2">{examTitle}</h1>
                <p className="text-sm font-medium text-gray-500 text-center mb-2">第 {currentQuestionIndex + 1} / {totalQuestions} 题</p>
                <div className="w-full bg-gray-200 rounded-full h-2.5"><div className="bg-primary h-2.5 rounded-full" style={{ width: `${((currentQuestionIndex + 1) / totalQuestions) * 100}%` }}></div></div>
              </div>
              <div className="bg-surface p-6 rounded-2xl shadow-md mb-6">
                <h2 className="text-xl font-semibold mb-6 text-on-surface">{currentQuestionIndex + 1}. {currentQuestion.question}</h2>
                <div className="space-y-3">
                  {currentQuestion.shuffledOptions.map((option, index) => {
                    const isSelected = userAnswers.get(currentQuestion.id) === option;
                    return (
                      <button key={index} onClick={() => handleAnswerSelect(currentQuestion.id, option)} className={`w-full text-left p-4 rounded-lg border-2 transition-all duration-200 flex items-center gap-4 ${isSelected ? 'bg-primary/10 border-primary font-semibold text-primary' : 'bg-gray-50 hover:bg-gray-100 border-gray-200 text-on-surface'}`}>
                        {isSelected ? <CheckCircleIcon className="w-6 h-6 text-primary flex-shrink-0" /> : <CircleIcon className="w-6 h-6 text-gray-400 flex-shrink-0" />}
                        <span className="flex-grow">{option}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="flex justify-between items-center">
                <button onClick={() => setCurrentQuestionIndex(prev => Math.max(0, prev - 1))} disabled={currentQuestionIndex === 0} className="px-6 py-2 bg-gray-200 text-gray-700 font-semibold rounded-full shadow-sm hover:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"><ArrowLeftIcon className="w-5 h-5" />上一题</button>
                {currentQuestionIndex < totalQuestions - 1 ? (
                  <button onClick={() => setCurrentQuestionIndex(prev => Math.min(totalQuestions - 1, prev + 1))} className="px-6 py-2 bg-primary text-on-primary font-semibold rounded-full shadow-md hover:bg-primary-light transition-colors flex items-center gap-2">下一题<ArrowRightIcon className="w-5 h-5" /></button>
                ) : (
                  <button onClick={() => setExamState(ExamState.PRE_SUBMIT)} className="px-6 py-2 bg-green-500 text-white font-semibold rounded-full shadow-md hover:bg-green-600 transition-colors flex items-center gap-2">提交答卷<PaperAirplaneIcon className="w-5 h-5" /></button>
                )}
              </div>
            </div>
            <div className="md:col-span-1 bg-surface p-4 rounded-2xl shadow-md">
                <h3 className="font-bold text-center mb-4 text-on-surface">题目导航</h3>
                <div className="grid grid-cols-5 gap-2">
                    {examQuestions.map((_, index) => {
                        const isCurrent = index === currentQuestionIndex; const isAnswered = userAnswers.has(examQuestions[index].id);
                        let buttonClass = isCurrent ? 'bg-primary hover:bg-primary-light text-on-primary ring-2 ring-offset-2 ring-primary' : isAnswered ? 'bg-green-100 hover:bg-green-200 text-green-800' : 'bg-gray-200 hover:bg-gray-300 text-gray-700';
                        return (<button key={index} onClick={() => setCurrentQuestionIndex(index)} className={`w-10 h-10 flex items-center justify-center rounded-full font-semibold transition-colors duration-200 ${buttonClass}`}>{index + 1}</button>);
                    })}
                </div>
            </div>
          </div>
        );
      case ExamState.PRE_SUBMIT:
        const unansweredQuestions = examQuestions.filter(q => !userAnswers.has(q.id));
        return (
          <div className="text-center w-full max-w-md mx-auto bg-surface p-8 rounded-2xl shadow-xl">
            <h1 className="text-3xl font-bold text-primary mb-4">提交确认</h1>
            {unansweredQuestions.length > 0 ? (
              <div>
                <p className="text-lg text-yellow-700 mb-4">你还有 <strong className="font-bold">{unansweredQuestions.length}</strong> 道题未作答：</p>
                <div className="flex flex-wrap justify-center gap-2 mb-8 max-h-40 overflow-y-auto p-2 bg-gray-100 rounded-lg">{unansweredQuestions.map(q => (<span key={q.id} className="bg-yellow-200 text-yellow-800 text-sm font-bold px-3 py-1 rounded-full">{examQuestions.findIndex(eq => eq.id === q.id) + 1}</span>))}</div>
                <p className="text-gray-600 mb-6">确定要提交吗？</p>
              </div>
            ) : <p className="text-lg text-green-700 mb-8">所有题目已完成！准备好提交答卷了吗？</p>}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <button onClick={() => setExamState(ExamState.IN_PROGRESS)} className="px-6 py-3 bg-secondary text-on-surface font-semibold rounded-full shadow-md hover:bg-gray-300 transform hover:-translate-y-0.5 transition-all duration-300 ease-in-out focus:outline-none focus:ring-4 focus:ring-gray-400/50 flex items-center justify-center gap-2 w-full sm:w-auto"><ArrowLeftIcon className="w-5 h-5" />返回修改</button>
              <button onClick={handleSubmit} className="px-6 py-3 bg-green-500 text-white font-bold rounded-full shadow-lg hover:bg-green-600 transform hover:-translate-y-1 transition-all duration-300 ease-in-out focus:outline-none focus:ring-4 focus:ring-green-500/50 flex items-center justify-center gap-2 w-full sm:w-auto"><PaperAirplaneIcon className="w-5 h-5" />确认提交</button>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <main className="min-h-screen w-full flex items-center justify-center p-4 sm:p-6 lg:p-8 font-sans bg-background pt-24">
      {renderTopBar()}
      {renderContent()}
    </main>
  );
};

export default App;