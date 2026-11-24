"use client";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { LOCAL_DELIVERY_ESTIMATE } from "@/lib/deliveryEstimate";
import Link from "next/link";
import {
  CheckCircle,
  AlertCircle,
  Clock,
  Headphones,
  Mail,
  MapPin,
  MessageSquare,
  Phone,
  Send,
  Shield,
  ArrowLeft
} from "lucide-react";
import { useState } from "react";
import { useSettings } from "@/lib/useSettings";
import { phoneCallHref } from "@/lib/contactLinks";

const contactTopics = ["Order & payment", "Delivery", "Product question", "Wholesale", "Other"];

export default function Contact() {
  const { settings, loading } = useSettings();
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    subject: "",
    message: "",
    category: contactTopics[0],
    website: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submission, setSubmission] = useState<{ ticketId: string; emailSent: boolean; emailWarning?: string } | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const response = await fetch("/api/support/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: formData.name,
          email: formData.email,
          subject: formData.subject,
          message: formData.message,
          category: formData.category,
          website: formData.website,
        }),
      });
      const result = await response.json() as {
        success?: boolean;
        ticketId?: string;
        emailSent?: boolean;
        emailWarning?: string;
        error?: string;
      };
      if (!response.ok || !result.success || !result.ticketId) {
        throw new Error(result.error || "Your message could not be sent. Please try again.");
      }

      setSubmission({
        ticketId: result.ticketId,
        emailSent: Boolean(result.emailSent),
        emailWarning: result.emailWarning,
      });
      setFormData({
        name: "",
        email: "",
        subject: "",
        message: "",
        category: contactTopics[0],
        website: "",
      });
    } catch (err) {
      console.error("Contact form error:", err);
      setSubmitError(err instanceof Error ? err.message : "Sorry, your message couldn't be sent. Please try WhatsApp.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const contactInfo = [
    {
      icon: Mail,
      title: "Email Us",
      details: [loading ? '...' : settings.contact.email],
      description: "Send us an email anytime",
    },
    {
      icon: Phone,
      title: "Call Us",
      details: [loading ? '...' : `+${settings.contact.whatsapp}`],
      description: "Customer care is online 24/7",
    },
    {
      icon: MapPin,
      title: "Visit Us",
      details: [loading ? '...' : settings.contact.address],
      description: "Come say hello at our office",
    },
    {
      icon: Clock,
      title: "Customer Care",
      details: ["Online 24/7"],
      description: "We reply within 15 minutes",
    },
  ];

  const features = [
    {
      icon: Headphones,
      title: "Bar Support",
      description: "Assistance with all product inquiries",
    },
    {
      icon: MessageSquare,
      title: "Quick Response",
      description: "Customer care is online 24/7. We reply within 15 minutes.",
    },
    {
      icon: Shield,
      title: "Secure & Private",
      description: "Your information is safe with us",
    },
  ];

  return (
    <div className="bg-background text-left">
      <section className="py-16 lg:py-24 bg-gradient-to-br from-primary/5 to-accent/5">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <Link href="/" className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-primary transition-colors mb-8">
            <ArrowLeft className="h-4 w-4" /> Back to Store
          </Link>
          <div className="text-center max-w-3xl mx-auto">
            <Badge className="mb-6 bg-primary text-primary-foreground font-black uppercase tracking-widest text-[10px]">
              Support Hub
            </Badge>
            <h1 className="text-4xl lg:text-6xl font-black text-foreground mb-6 uppercase tracking-tighter">
              Get in touch with{" "}
              <span className="text-primary block lg:inline">
                our beverage team
              </span>
            </h1>
            <p className="text-lg text-muted-foreground max-w-2xl mx-auto font-medium">
              Have a question about a product, compatibility, or your order? We&apos;re here to help you get the best out of your experience.
            </p>
            <p className="mt-4 text-sm font-semibold text-slate-700">
              Customer care is online 24/7. We reply within 15 minutes by WhatsApp, phone, email, or the support form.
            </p>
          </div>
        </div>
      </section>

      <section className="py-16 lg:py-24 text-left">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-3 gap-12 text-left">
            <div className="lg:col-span-2 text-left">
              <Card className="rounded-3xl border-slate-100 shadow-sm overflow-hidden">
                <CardHeader className="bg-slate-50/50 border-b border-slate-50 p-8">
                  <CardTitle className="text-2xl font-black uppercase tracking-tight text-foreground">
                    Send us a message
                  </CardTitle>
                  <p className="text-slate-500 font-medium text-sm mt-1">
                    Fill out the form below. Customer care is online 24/7 and replies within 15 minutes.
                  </p>
                </CardHeader>
                <CardContent className="p-8">
                  {submission ? (
                    <div role="status" aria-live="polite" className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 sm:p-8">
                      <div className="flex items-start gap-4">
                        <div className="rounded-xl bg-white p-3 text-emerald-600 shadow-sm"><CheckCircle className="h-6 w-6" /></div>
                        <div className="min-w-0 flex-1">
                          <h3 className="text-lg font-black text-emerald-950">Your message is with our team.</h3>
                          <p className="mt-1 text-sm leading-6 text-emerald-900/80">
                            We saved your enquiry in the support workspace. Keep this reference for follow-up:
                            <span className="ml-1 font-black">#{submission.ticketId.slice(0, 8).toUpperCase()}</span>
                          </p>
                          {submission.emailSent ? (
                            <p className="mt-3 inline-flex items-center gap-2 text-xs font-bold text-emerald-800">
                              <Mail className="h-4 w-4" /> An email alert was sent to the configured support team.
                            </p>
                          ) : (
                            <p className="mt-3 flex items-start gap-2 text-xs font-bold text-amber-800">
                              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                              {submission.emailWarning || "Your message is in the admin panel, but the email alert needs attention."}
                            </p>
                          )}
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setSubmission(null);
                          setSubmitError(null);
                        }}
                        className="mt-6 rounded-xl border-emerald-200 bg-white text-emerald-900 hover:bg-emerald-100"
                      >
                        Send another message
                      </Button>
                    </div>
                  ) : (
                  <form onSubmit={handleSubmit} className="space-y-6">
                    <div className="space-y-2 text-left">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">What can we help with?</p>
                      <div className="flex flex-wrap gap-2" role="group" aria-label="Choose a support topic">
                        {contactTopics.map(topic => (
                          <button
                            key={topic}
                            type="button"
                            aria-pressed={formData.category === topic}
                            onClick={() => setFormData(previous => ({ ...previous, category: topic }))}
                            className={`rounded-full border px-3 py-2 text-xs font-bold transition-all ${
                              formData.category === topic
                                ? "border-primary bg-primary text-primary-foreground shadow-sm"
                                : "border-slate-200 bg-white text-slate-600 hover:border-primary/40 hover:text-primary"
                            }`}
                          >
                            {topic}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="grid sm:grid-cols-2 gap-6">
                      <div className="space-y-2 text-left">
                        <label
                          htmlFor="name"
                          className="text-[10px] font-black uppercase tracking-widest text-slate-400"
                        >
                          Your Name
                        </label>
                        <Input
                          id="name"
                          name="name"
                          type="text"
                          placeholder="Patron Name"
                          value={formData.name}
                          onChange={handleInputChange}
                          required
                          maxLength={120}
                          autoComplete="name"
                          className="bg-background border-slate-100 py-6 rounded-xl"
                        />
                      </div>

                      <div className="space-y-2 text-left">
                        <label
                          htmlFor="email"
                          className="text-[10px] font-black uppercase tracking-widest text-slate-400"
                        >
                          Your Email
                        </label>
                        <Input
                          id="email"
                          name="email"
                          type="email"
                          placeholder="your@gmail.com"
                          value={formData.email}
                          onChange={handleInputChange}
                          required
                          maxLength={254}
                          autoComplete="email"
                          className="bg-background border-slate-100 py-6 rounded-xl"
                        />
                      </div>
                    </div>

                    <div className="space-y-2 text-left">
                      <label
                        htmlFor="subject"
                        className="text-[10px] font-black uppercase tracking-widest text-slate-400"
                      >
                        Subject
                      </label>
                      <Input
                        id="subject"
                        name="subject"
                        type="text"
                        placeholder="How can we help you?"
                        value={formData.subject}
                        onChange={handleInputChange}
                        required
                        minLength={3}
                        maxLength={160}
                        className="bg-background border-slate-100 py-6 rounded-xl"
                      />
                    </div>

                    <div className="space-y-2 text-left">
                      <label
                        htmlFor="message"
                        className="text-[10px] font-black uppercase tracking-widest text-slate-400"
                      >
                        Your Message
                      </label>
                      <Textarea
                        id="message"
                        name="message"
                        placeholder="Tell us more about your question or concern..."
                        rows={6}
                        minLength={10}
                        maxLength={4000}
                        value={formData.message}
                        onChange={handleInputChange}
                        required
                        className="bg-background border-slate-100 rounded-xl resize-none"
                      />
                      <div className="flex items-center justify-between gap-3 text-[10px] font-medium text-slate-400">
                        <span>Include your order number if your question is about an order.</span>
                        <span>{formData.message.length}/4000</span>
                      </div>
                    </div>

                    <div aria-hidden="true" className="absolute left-[-10000px] top-auto h-px w-px overflow-hidden">
                      <label htmlFor="contact-website">Leave this field empty</label>
                      <input
                        id="contact-website"
                        name="website"
                        type="text"
                        tabIndex={-1}
                        autoComplete="off"
                        value={formData.website}
                        onChange={handleInputChange}
                      />
                    </div>

                    {submitError && (
                      <div role="alert" className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-700">
                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /> {submitError}
                      </div>
                    )}

                    <p className="text-xs leading-5 text-slate-500">
                      Your message is saved to our admin support workspace. We also email the configured support contact when email alerts are available.
                    </p>
                    <Button
                      type="submit"
                      disabled={isSubmitting}
                      className="w-full sm:w-auto h-14 px-10 rounded-2xl bg-primary text-white font-black uppercase tracking-widest text-xs shadow-xl shadow-primary/20 transition-all active:scale-95"
                    >
                      {isSubmitting ? (
                        <div className="flex items-center gap-2">
                          <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                          Sending...
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <Send className="h-4 w-4" />
                          Send Message
                        </div>
                      )}
                    </Button>
                  </form>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="space-y-8 text-left">
              <Card className="rounded-3xl border-slate-100 shadow-sm overflow-hidden p-2 bg-slate-50">
                <CardHeader>
                  <CardTitle className="text-lg font-black uppercase tracking-widest text-foreground">
                    Contact Info
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6 pt-2">
                  {contactInfo.map((info, index) => (
                    <div key={index} className="flex items-start gap-4">
                      <div className="p-3 bg-white rounded-xl shadow-sm">
                        <info.icon className="h-5 w-5 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-bold text-foreground text-sm uppercase tracking-tight">
                          {info.title}
                        </h3>
                        {info.details.map((detail, idx) => (
                          <p
                            key={idx}
                            className="text-sm text-slate-500 font-medium"
                          >
                            {detail}
                          </p>
                        ))}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card className="rounded-3xl border-slate-100 shadow-sm overflow-hidden p-2">
                <CardHeader>
                  <CardTitle className="text-lg font-black uppercase tracking-widest text-foreground">
                    Why us?
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4 pt-2">
                  {features.map((feature, index) => (
                    <div key={index}>
                      <div className="flex items-start gap-4">
                        <div className="p-2 bg-primary/10 rounded-lg text-primary">
                          <feature.icon className="h-4 w-4" />
                        </div>
                        <div>
                          <h4 className="font-bold text-foreground text-sm uppercase tracking-tight">
                            {feature.title}
                          </h4>
                          <p className="text-xs text-slate-500 font-medium">
                            {feature.description}
                          </p>
                        </div>
                      </div>
                      {index < features.length - 1 && (
                        <Separator className="mt-4 border-slate-50" />
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </section>

      <section className="py-16 lg:py-24 bg-white text-foreground border-t border-slate-100">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8 text-left">
          <div className="text-center mb-16">
            <Badge variant="outline" className="mb-6 border-slate-200 text-slate-400 font-black uppercase tracking-widest text-[10px]">
              FAQ
            </Badge>
            <h2 className="text-4xl lg:text-5xl font-black uppercase tracking-tighter text-foreground">
              Common Questions
            </h2>
          </div>

          <div className="grid md:grid-cols-2 gap-8 max-w-5xl mx-auto text-left">
            {[
              {
                question: "Are your drinks authentic?",
                answer:
                  "Yes, we strictly deal in 100% authentic products. All vintages and spirits come in their original manufacturer packaging.",
              },
              {
                question: "How long does delivery take?",
                answer:
                  `Eligible local Nairobi deliveries are estimated at ${LOCAL_DELIVERY_ESTIMATE}, depending on your exact address and availability; confirm the ETA at checkout. Upcountry orders use regional parcel services and typically take 2-3 business days.`,
              },
              {
                question: "Do you offer quality checks?",
                answer:
                  "All our items undergo rigorous quality testing before dispatch to ensure zero defects upon delivery. Authenticity is our priority.",
              },
              {
                question: "What is the return policy?",
                answer:
                  "To maintain product integrity and security, all sales are final. We encourage customers to verify their selection before placing an order.",
              },
            ].map((faq, index) => (
              <div key={index} className="bg-slate-50 border border-slate-100 rounded-[2rem] p-8 hover:bg-slate-100 transition-colors shadow-sm">
                  <h3 className="font-black text-primary text-lg uppercase tracking-tight mb-4">
                    {faq.question}
                  </h3>
                  <p className="text-slate-600 font-medium leading-relaxed">{faq.answer}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-24 bg-white text-left">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-primary rounded-[3rem] p-12 lg:p-20 text-center shadow-2xl shadow-primary/20">
              <h2 className="text-4xl lg:text-6xl font-black text-white mb-6 uppercase tracking-tighter">
                Still have questions?
              </h2>
              <p className="text-xl text-white/80 mb-12 max-w-2xl mx-auto font-medium">
                Our beverage support team is ready to assist you with any quality compatibility or order inquiries.
              </p>

              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Button
                  className="h-16 px-10 rounded-2xl bg-white text-primary hover:bg-slate-50 font-black uppercase tracking-widest text-xs shadow-xl shadow-black/10"
                  asChild
                >
                    <a href={loading ? undefined : phoneCallHref(settings.contact.whatsapp) || undefined}>
                        <Phone className="h-4 w-4 mr-2" />
                        Call Us Now
                    </a>
                </Button>

                <Button className="h-16 px-10 rounded-2xl bg-white text-primary hover:bg-slate-50 font-black uppercase tracking-widest text-xs shadow-xl shadow-black/10" asChild>
                    <a href={loading ? "#" : `https://wa.me/${settings.contact.whatsapp}`} target="_blank" rel="noopener noreferrer">
                        <MessageSquare className="h-4 w-4 mr-2" />
                        Chat on WhatsApp
                    </a>
                </Button>
              </div>
          </div>
        </div>
      </section>
    </div>
  );
}
