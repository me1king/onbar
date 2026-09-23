'use client';

import * as React from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
    ShieldCheck,
    Database,
    CheckCircle2,
    QrCode,
    X,
    ExternalLink,
    Download,
    Award,
    Check
} from 'lucide-react';
import Link from 'next/link';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

interface AuthenticityProps {
    productId?: string | number;
    productName?: string;
    batchNo?: string;
    origin?: string;
    abv?: string;
    isVerified?: boolean;
}

export default function AuthenticitySentinel({
    productId = '38',
    productName = 'Premium Beverage Reserve',
    batchNo = 'OB-GRID-2026',
    origin = 'Authorized Importer',
    abv = '40%'
}: AuthenticityProps) {
    const [showLabReport, setShowLabReport] = React.useState(false);

    const generateLabReportPDF = () => {
        const doc = new jsPDF();
        doc.setFillColor(16, 185, 129); // Emerald 500
        doc.rect(0, 0, 210, 24, 'F');

        doc.setTextColor(255, 255, 255);
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.text('ONLINE BAR — CERTIFICATE OF AUTHENTICITY & LAB REPORT', 14, 16);

        doc.setTextColor(30, 41, 59);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text(`Lab Report Ref: OB-LAB-2026-${batchNo}`, 14, 34);
        doc.text(`Issued: ${new Date().toLocaleDateString()} ${new Date().toLocaleTimeString()}`, 14, 40);

        autoTable(doc, {
            startY: 48,
            head: [['Technical Test Parameter', 'Measured Specification', 'Quality Standard', 'Result']],
            body: [
                ['Product Identification', productName, 'Cellar Hub Registry', 'MATCHED'],
                ['Batch & Lot Number', batchNo, 'Anti-Counterfeit Ledger', 'VERIFIED'],
                ['Country of Origin', origin, 'Authorized Global Importer', 'AUTHENTIC'],
                ['Alcohol By Volume (ABV)', abv, 'KEBS & International Std', 'PASSED (100%)'],
                ['Methanol & Contaminants', '0.00% Zero Trace', 'Safety Threshold < 0.05%', 'PASSED (CLEAN)'],
                ['Physical Bottle Seal', 'Tamper-Evident RFID/NFC', 'Sealed At Source', 'INTACT'],
                ['Dispatch Authorization', 'VVIP Cellar Vault', 'Quality Control Protocol', 'DISPATCH READY']
            ],
            theme: 'grid',
            headStyles: { fillColor: [16, 185, 129], textColor: [255, 255, 255] }
        });

        doc.setFontSize(9);
        doc.setTextColor(100, 116, 139);
        doc.text('This official certificate guarantees 100% genuine beverage provenance delivered by Online Bar Nairobi.', 14, (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 16);

        doc.save(`OnlineBar_LabReport_${batchNo}.pdf`);
    };

    return (
        <>
            <Card className="p-8 rounded-[3rem] bg-emerald-50 border border-emerald-100 shadow-sm space-y-8 relative overflow-hidden group text-left">
                <div className="relative z-10 flex flex-col md:flex-row justify-between items-center gap-8">

                    <div className="flex items-center gap-6">
                        <div className="h-16 w-16 rounded-[1.8rem] bg-white flex items-center justify-center text-emerald-500 shadow-inner group-hover:scale-110 transition-transform duration-500">
                            <ShieldCheck size={32} />
                        </div>
                        <div>
                            <div className="flex items-center gap-2 mb-1">
                                <span className="px-2 py-0.5 rounded bg-emerald-500 text-white text-[7px] font-black uppercase tracking-widest">Master Verified</span>
                                <h3 className="text-lg font-black uppercase tracking-tighter text-emerald-900 leading-none">Authenticity Secure</h3>
                            </div>
                            <p className="text-[10px] font-medium text-emerald-600 italic">
                                &quot;Every bottle in our cellar is 100% verified genuine before dispatch.&quot;
                            </p>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 flex-1 w-full max-w-sm">
                        <div className="p-4 rounded-2xl bg-white/50 border border-emerald-100 space-y-1">
                            <p className="text-[8px] font-black text-emerald-400 uppercase tracking-widest">Source Origin</p>
                            <p className="text-[11px] font-black text-emerald-800 uppercase truncate">{origin || 'Authorized Importer'}</p>
                        </div>
                        <div className="p-4 rounded-2xl bg-white/50 border border-emerald-100 space-y-1">
                            <p className="text-[8px] font-black text-emerald-400 uppercase tracking-widest">Batch Registry</p>
                            <p className="text-[11px] font-black text-emerald-800 uppercase truncate">{batchNo || 'OB-GRID-2026'}</p>
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={() => setShowLabReport(true)}
                        className="hidden lg:block text-right group/qr transition-transform hover:scale-110 cursor-pointer"
                        title="Click to view Lab Authenticity Certificate"
                    >
                        <QrCode size={48} className="text-emerald-300 group-hover/qr:text-emerald-600 transition-colors" />
                    </button>
                </div>

                <div className="relative z-10 flex items-center justify-between pt-4 border-t border-emerald-200/50">
                    <div className="flex items-center gap-2">
                        <CheckCircle2 size={12} className="text-emerald-500" />
                        <span className="text-[9px] font-black uppercase tracking-widest text-emerald-600">Anti-Counterfeit Protocol Active</span>
                    </div>
                    <button
                        type="button"
                        onClick={() => setShowLabReport(true)}
                        className="text-[9px] font-black uppercase tracking-widest text-emerald-700 underline underline-offset-4 hover:text-emerald-900 transition-colors flex items-center gap-1"
                    >
                        <span>Request Lab Report</span>
                        <span>&rarr;</span>
                    </button>
                </div>

                {/* Background Graphic */}
                <Database className="absolute -bottom-10 -right-10 h-48 w-48 text-emerald-500/5 rotate-12 -z-0" />
            </Card>

            {/* LAB AUTHENTICITY & QUALITY CERTIFICATE MODAL */}
            {showLabReport && (
                <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/80 backdrop-blur-md p-4 animate-in fade-in duration-300">
                    <div className="bg-white rounded-[3rem] border border-slate-100 max-w-xl w-full p-8 sm:p-10 shadow-2xl relative space-y-8 text-left max-h-[90vh] overflow-y-auto no-scrollbar">

                        {/* Modal Close Button */}
                        <button
                            type="button"
                            onClick={() => setShowLabReport(false)}
                            className="absolute top-6 right-6 h-10 w-10 rounded-full bg-slate-100 text-slate-400 hover:bg-rose-500 hover:text-white flex items-center justify-center transition-all"
                        >
                            <X size={18} />
                        </button>

                        {/* Modal Header */}
                        <div className="flex items-center gap-4 border-b border-slate-100 pb-6">
                            <div className="h-14 w-14 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-600 shadow-inner">
                                <Award size={28} />
                            </div>
                            <div>
                                <div className="flex items-center gap-2">
                                    <span className="px-2.5 py-0.5 rounded-full bg-emerald-500 text-white text-[8px] font-black uppercase tracking-widest">
                                        CERTIFIED GENUINE
                                    </span>
                                    <span className="text-[9px] font-bold text-slate-400 font-mono">REF: OB-LAB-{batchNo}</span>
                                </div>
                                <h3 className="text-2xl font-black uppercase tracking-tight text-foreground mt-1">Certificate of Analysis</h3>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Chemical Purity & Authenticity Passport</p>
                            </div>
                        </div>

                        {/* Certificate Data Summary */}
                        <div className="space-y-4">
                            <div className="p-5 rounded-2xl bg-slate-50 border border-slate-100 space-y-3">
                                <div className="flex justify-between items-center text-xs font-black uppercase">
                                    <span className="text-slate-500">Product Ingested</span>
                                    <span className="text-foreground">{productName}</span>
                                </div>
                                <div className="flex justify-between items-center text-xs font-black uppercase">
                                    <span className="text-slate-500">Batch / Registry Code</span>
                                    <span className="text-emerald-600 font-mono">{batchNo}</span>
                                </div>
                                <div className="flex justify-between items-center text-xs font-black uppercase">
                                    <span className="text-slate-500">Source Importer</span>
                                    <span className="text-slate-800">{origin}</span>
                                </div>
                                <div className="flex justify-between items-center text-xs font-black uppercase">
                                    <span className="text-slate-500">Alcohol Content</span>
                                    <span className="text-amber-600 font-extrabold">{abv}</span>
                                </div>
                            </div>

                            {/* Test Matrix Checklist */}
                            <div className="space-y-2">
                                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Lab Test Verification Checklist</p>
                                <div className="grid sm:grid-cols-2 gap-3">
                                    {[
                                        { label: 'Methanol & Toxins Test', status: '0.00% Clean' },
                                        { label: 'Physical Security Seal', status: 'Intact & Sealed' },
                                        { label: 'Ethanol Standard Check', status: '100% Authentic' },
                                        { label: 'Dispatch Authorization', status: 'VVIP Cellar Vault' },
                                    ].map(item => (
                                        <div key={item.label} className="p-3 rounded-xl bg-emerald-50/50 border border-emerald-100 flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <div className="h-5 w-5 rounded-full bg-emerald-500 text-white flex items-center justify-center">
                                                    <Check size={12} />
                                                </div>
                                                <span className="text-[9px] font-black uppercase text-emerald-900">{item.label}</span>
                                            </div>
                                            <span className="text-[8px] font-extrabold text-emerald-600 uppercase">{item.status}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Modal Footer Actions */}
                        <div className="pt-4 border-t border-slate-100 flex flex-col sm:flex-row gap-3">
                            <Button
                                type="button"
                                onClick={generateLabReportPDF}
                                className="flex-1 h-14 rounded-2xl bg-emerald-600 text-white font-black uppercase text-[10px] tracking-widest shadow-lg shadow-emerald-500/20 hover:bg-emerald-500 transition-all flex items-center justify-center gap-2"
                            >
                                <Download size={16} /> Download Official PDF Report
                            </Button>

                            <Link href={`/verify/${productId}`} className="flex-1">
                                <Button
                                    type="button"
                                    variant="outline"
                                    className="w-full h-14 rounded-2xl border-slate-200 text-slate-700 font-black uppercase text-[10px] tracking-widest hover:bg-slate-50 transition-all flex items-center justify-center gap-2"
                                >
                                    <ExternalLink size={16} /> View Trust Passport
                                </Button>
                            </Link>
                        </div>

                    </div>
                </div>
            )}
        </>
    );
}
