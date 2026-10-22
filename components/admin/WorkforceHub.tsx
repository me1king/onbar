'use client';

import * as React from 'react';
import { Card } from '@/components/ui/card';
import { User, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

interface StaffRecord {
    id: string;
    email: string;
    role: string;
    status: string;
    last_activity_at: string;
    completed_tasks: number;
    overdue_tasks: number;
    sla_rating: number;
}

interface TaskRecord {
    assigned_to: string | null;
    status: string;
    due_date: string | null;
}

export default function WorkforceHub() {
    const [staff, setStaff] = React.useState<StaffRecord[]>([]);
    const [loading, setLoading] = React.useState(true);
    const [taskError, setTaskError] = React.useState<string | null>(null);
    const [staffError, setStaffError] = React.useState<string | null>(null);

    const fetchStaff = React.useCallback(async () => {
        const [staffResponse, tasksResponse] = await Promise.all([
            fetch('/api/admin/staff', { cache: 'no-store' }).catch((error: unknown) => {
                console.error('Could not load workforce records:', error);
                return null;
            }),
            fetch('/api/admin/operations/tasks', { cache: 'no-store' }).catch((error: unknown) => {
                console.error('Could not load workforce task metrics:', error);
                return null;
            })
        ]);

        let staffRecords: StaffRecord[] = [];
        if (staffResponse?.ok) {
            const result = await staffResponse.json().catch(() => ({})) as { staff?: StaffRecord[] };
            staffRecords = result.staff || [];
            setStaffError(result.staff ? null : 'Staff records could not be loaded.');
        } else {
            const result = await staffResponse?.json().catch(() => ({})) as { error?: string } | undefined;
            setStaffError(result?.error || 'Staff records could not be loaded.');
        }

        let tasks: TaskRecord[] = [];
        if (tasksResponse?.ok) {
            const result = await tasksResponse.json().catch(() => ({})) as { tasks?: TaskRecord[] };
            tasks = result.tasks || [];
            setTaskError(result.tasks ? null : 'Task metrics could not be loaded.');
        } else {
            const result = await tasksResponse?.json().catch(() => ({})) as { error?: string } | undefined;
            setTaskError(result?.error || 'Task metrics could not be loaded.');
        }

        if (staffResponse?.ok) {
            const now = new Date();
            const processed = staffRecords.map(s => {
                const staffTasks = tasks.filter(t => t.assigned_to === s.email || t.assigned_to === 'Staff');
                const overdue = tasks.filter(t =>
                    (t.assigned_to === s.email) &&
                    t.status !== 'Done' &&
                    t.due_date && new Date(t.due_date) < now
                ).length;

                return {
                    ...s,
                    completed_tasks: staffTasks.filter(t => t.status === 'Done').length,
                    overdue_tasks: overdue,
                };
            });
            setStaff(processed);
        }
        setLoading(false);
    }, []);

    React.useEffect(() => {
        void fetchStaff();
        const interval = window.setInterval(() => void fetchStaff(), 30_000);
        return () => window.clearInterval(interval);
    }, [fetchStaff]);

    if (loading) return <div className="h-48 bg-slate-50 rounded-[3rem] animate-pulse" />;

    return (
        <Card className="p-10 rounded-[3.5rem] bg-white border border-slate-100 shadow-sm space-y-10 text-left">
            <div className="flex justify-between items-center px-2">
                <div className="flex items-center gap-4">
                    <div className="h-12 w-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary shadow-sm">
                        <User size={24} />
                    </div>
                    <div>
                        <h3 className="text-xl font-black uppercase tracking-tighter text-foreground leading-none">Workforce Grid</h3>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-1">Real-time Accountability Node</p>
                    </div>
                </div>
                <div className="flex items-center gap-2 px-3 py-1 bg-emerald-50 text-emerald-600 rounded-full text-[9px] font-black uppercase border border-emerald-100">
                    {staff.filter(s => s.status === 'Online').length} Active Admins
                </div>
            </div>

            {staffError && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">{staffError}</p>}
            <div className="grid gap-4">
                {taskError && (
                    <p role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-bold text-amber-800">
                        Workforce task metrics unavailable: {taskError}
                    </p>
                )}
                {staff.map((s) => (
                    <div key={s.id} className="p-6 rounded-[2.5rem] bg-slate-50 border border-slate-100 flex flex-col sm:flex-row justify-between items-center gap-6 group hover:bg-white hover:shadow-xl transition-all">
                        <div className="flex items-center gap-6 text-left w-full sm:w-auto">
                            <div className="relative">
                                <div className="h-14 w-14 rounded-2xl bg-white border border-slate-200 flex items-center justify-center text-foreground font-black text-xs uppercase shadow-sm">
                                    {s.email.substring(0, 2)}
                                </div>
                                <div className={cn(
                                    "absolute -top-1 -right-1 h-4 w-4 rounded-full border-2 border-white",
                                    s.status === 'Online' ? "bg-emerald-500 animate-pulse" : "bg-slate-300"
                                )} />
                            </div>
                            <div>
                                <h4 className="font-black text-foreground uppercase tracking-tight">{s.email.split('@')[0]}</h4>
                                <div className="flex items-center gap-2 mt-1">
                                    <span className="text-[9px] font-black text-primary uppercase tracking-widest">{s.role}</span>
                                    <div className="h-1 w-1 rounded-full bg-slate-300" />
                                    <span className="text-[8px] font-bold text-slate-400 uppercase flex items-center gap-1">
                                        <Clock size={10} /> {new Date(s.last_activity_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center gap-10 text-right w-full sm:w-auto justify-between sm:justify-end">
                            <div className="space-y-1">
                                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Tasks</p>
                                <div className="flex items-center gap-2">
                                    <span className="text-sm font-black text-foreground">{s.completed_tasks}</span>
                                    <span className="text-[10px] font-bold text-slate-300">/</span>
                                    <span className="text-sm font-black text-rose-500">{s.overdue_tasks}</span>
                                </div>
                            </div>
                            <div className="space-y-1">
                                <p className="text-[8px] font-black text-slate-400 uppercase tracking-widest">SLA</p>
                                <p className={cn(
                                    "text-lg font-black tracking-tighter",
                                    s.sla_rating >= 90 ? "text-emerald-500" : "text-amber-500"
                                )}>{s.sla_rating}%</p>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </Card>
    );
}
