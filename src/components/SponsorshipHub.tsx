"use client";

import React, { useState, useEffect } from "react";
import {
  Search,
  MapPin,
  Building2,
  X,
  ChevronLeft,
  ChevronRight,
  AlertTriangle,
  Briefcase,
  Loader2,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import Papa from "papaparse";
import { socCodes } from "@/data/socCodes";

interface SponsorCompany {
  organisationName: string;
  townCity: string;
  county: string;
  typeRating: string;
  route: string;
}

interface CompanyDetails {
  registrationNumber?: string;
  sicCodes?: string[];
  registeredAddress?: string;
  companySize?: string;
  description?: string;
  website?: string;
  foundedYear?: string;
  employees?: string;
  careerPageUrl?: string;
  applicationGuide?: string;
  visaSponsorshipInfo?: string;
  keySkills?: string[];
  salaryBreakdown?: {
    entry: string;
    mid: string;
    senior: string;
  };
  activeRoles?: Array<{
    title: string;
    socCode: string;
    level: string;
    sponsorshipEligible: boolean;
    skillClassification?: string;
  }>;
  bestTimeToApply?: string;
  interviewTips?: string;
}

type FilterType = "all" | "aiVerified" | "new";

const SponsorshipHub: React.FC = () => {
  const [activeTab, setActiveTab] = useState<"companies" | "roles">(
    "companies",
  );
  const [roleSearchQuery, setRoleSearchQuery] = useState("");
  const [companies, setCompanies] = useState<SponsorCompany[]>([]);
  const [filteredCompanies, setFilteredCompanies] = useState<SponsorCompany[]>(
    [],
  );
  const [displayLimit] = useState(12);
  const [currentPage, setCurrentPage] = useState(1);
  const [currentRolePage, setCurrentRolePage] = useState(1);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [selectedCompany, setSelectedCompany] =
    useState<SponsorCompany | null>(null);
  const [selectedRole, setSelectedRole] = useState<(typeof socCodes)[0] | null>(
    null,
  );
  const [activeFilter, setActiveFilter] = useState<FilterType>("all");
  const [stats, setStats] = useState({
    total: 0,
    aiVerified: 0,
    newSince: 0,
  });

  const getPaginationRange = (current: number, total: number) => {
    const totalSlots = 11;

    if (total <= totalSlots) {
      return Array.from({ length: total }, (_, i) => i + 1);
    }

    if (current <= 7) {
      return [1, 2, 3, 4, 5, 6, 7, 8, 9, "...", total];
    }

    if (current >= total - 6) {
      return [1, "...", ...Array.from({ length: 9 }, (_, i) => total - 8 + i)];
    }

    return [
      1,
      "...",
      current - 2,
      current - 1,
      current,
      current + 1,
      current + 2,
      "...",
      total,
    ];
  };

  useEffect(() => {
    loadCSVData();
  }, []);

  useEffect(() => {
    filterCompanies();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, companies, activeFilter]);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, activeFilter]);

  useEffect(() => {
    setCurrentRolePage(1);
  }, [roleSearchQuery]);

  const loadCSVData = async () => {
    try {
      const response = await fetch("/data/workers.csv");
      const csvText = await response.text();

      Papa.parse(csvText, {
        header: true,
        complete: (results: Papa.ParseResult<any>) => {
          const parsed = results.data
            .map((row: any) => ({
              organisationName: row["Organisation Name"] || "",
              townCity: row["Town/City"] || "",
              county: row["County"] || "",
              typeRating: row["Type & Rating"] || "",
              route: row["Route"] || "",
            }))
            .filter((c: SponsorCompany) => c.organisationName.trim() !== "");

          setCompanies(parsed);
          setStats({
            total: parsed.length,
            aiVerified: Math.floor(parsed.length * 0.114),
            newSince: Math.floor(parsed.length * 0.0074),
          });
          setIsLoading(false);
        },
        error: (error: any) => {
          console.error("CSV Parse Error:", error);
          setIsLoading(false);
        },
      });
    } catch (error) {
      console.error("Failed to load CSV:", error);
      setIsLoading(false);
    }
  };

  const filterCompanies = () => {
    let filtered = companies;

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (c) =>
          c.organisationName.toLowerCase().includes(query) ||
          c.townCity.toLowerCase().includes(query) ||
          c.county.toLowerCase().includes(query),
      );
    } else {
      if (activeFilter === "aiVerified") {
        filtered = filtered.filter((c) => c.typeRating.includes("A rating"));
      } else if (activeFilter === "new") {
        filtered = filtered.slice(0, Math.min(100, stats.newSince));
      }
    }

    setFilteredCompanies(filtered);
  };

  if (isLoading) {
    return (
      <div className="bg-slate-50 flex-1 flex flex-col h-full items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-xl font-medium text-indigo-600 animate-pulse">
            Loading UK Sponsor Register...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-slate-50 flex-1 flex flex-col h-full overflow-y-auto pb-20 scrollbar-hide">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 md:py-12">
        <div className="mb-12 space-y-8">
          <div className="text-center space-y-4">
            <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight text-slate-900">
              UK Visa Sponsor Register
            </h1>
            <p className="text-slate-500 text-base md:text-lg max-w-2xl mx-auto leading-relaxed">
              Search {stats.total.toLocaleString()}+ verified companies licensed
              to sponsor work visas. Data directly from UK Home Office.
            </p>
          </div>

          <div className="bg-[#FFF8CC] border border-[#FDE047] rounded-lg p-4 flex gap-3 text-slate-900 text-sm max-w-3xl mx-auto shadow-sm">
            <AlertTriangle className="shrink-0 w-5 h-5 text-black" />
            <p>
              <span className="font-bold text-black">Official Register Data:</span>{" "}
              This directory mirrors the public UK Home Office sponsor register.
            </p>
          </div>

          <div className="flex gap-2 sm:gap-4 mb-8 border-b border-slate-200 overflow-x-auto scrollbar-hide">
            <button
              onClick={() => setActiveTab("companies")}
              className={`px-3 sm:px-4 py-3 flex items-center gap-2 font-medium transition-colors whitespace-nowrap ${
                activeTab === "companies"
                  ? "text-indigo-600 border-b-2 border-indigo-600"
                  : "text-slate-500 hover:text-slate-900"
              }`}
            >
              <Building2 size={18} />
              Companies
            </button>
            <button
              onClick={() => setActiveTab("roles")}
              className={`px-3 sm:px-4 py-3 flex items-center gap-2 font-medium transition-colors whitespace-nowrap ${
                activeTab === "roles"
                  ? "text-indigo-600 border-b-2 border-indigo-600"
                  : "text-slate-500 hover:text-slate-900"
              }`}
            >
              <Briefcase size={18} />
              Roles
            </button>
          </div>

          {activeTab === "companies" ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 lg:gap-6 mb-8">
                {[
                  {
                    label: "Active Sponsors",
                    value: stats.total.toLocaleString(),
                    filter: "all" as FilterType,
                  },
                ].map((stat, i) => (
                  <button
                    key={i}
                    onClick={() => setActiveFilter(stat.filter)}
                    className={`p-4 rounded-xl border transition-all text-left group ${
                      activeFilter === stat.filter
                        ? "border-blue-500 bg-blue-50/50 shadow-sm"
                        : "border-slate-200 bg-white hover:border-blue-300 hover:shadow-md"
                    } ${i === 2 && "sm:col-span-2 lg:col-span-1"}`}
                  >
                    <div
                      className={`text-2xl font-bold transition-colors ${
                        activeFilter === stat.filter
                          ? "text-blue-700"
                          : "text-slate-900 group-hover:text-blue-600"
                      }`}
                    >
                      {stat.value}
                    </div>
                    <div className="text-sm text-slate-500 mt-1 font-medium">
                      {stat.label}
                    </div>
                  </button>
                ))}
              </div>

              <div className="mb-8">
                <div className="flex gap-3">
                  <div className="relative flex-1">
                    <Search
                      className="absolute left-3 top-3 text-slate-400"
                      size={20}
                    />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search companies..."
                      className="w-full bg-white border border-slate-200 text-slate-900 pl-10 pr-4 py-2 rounded-lg focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                    />
                  </div>
                </div>
              </div>

              <div>
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="font-medium text-slate-700">
                    {filteredCompanies.length} companies found
                  </h3>
                </div>

                <AnimatePresence mode="wait">
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
                  >
                    {filteredCompanies
                      .slice(
                        (currentPage - 1) * displayLimit,
                        currentPage * displayLimit,
                      )
                      .map((company, index) => (
                        <CompanyCard
                          key={index}
                          company={company}
                          index={index}
                          onClick={() => setSelectedCompany(company)}
                        />
                      ))}
                  </motion.div>
                </AnimatePresence>

                {filteredCompanies.length > displayLimit && (
                  <div className="mt-12 flex flex-col items-center justify-center gap-6">
                    <div className="flex items-center gap-1 sm:gap-2 bg-white p-1.5 rounded-2xl border border-slate-200 shadow-sm">
                      <button
                        onClick={() =>
                          setCurrentPage((prev) => Math.max(1, prev - 1))
                        }
                        disabled={currentPage === 1}
                        className="p-2 sm:p-2.5 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed rounded-xl transition-all text-slate-600 flex items-center justify-center"
                        title="Previous Page"
                      >
                        <ChevronLeft size={20} />
                      </button>

                      <div className="flex items-center gap-1">
                        {getPaginationRange(
                          currentPage,
                          Math.ceil(filteredCompanies.length / displayLimit),
                        ).map((page: string | number, i: number) => (
                          <React.Fragment key={i}>
                            {page === "..." ? (
                              <span className="w-10 h-10 flex items-center justify-center text-slate-400 font-medium">
                                ...
                              </span>
                            ) : (
                              <button
                                onClick={() =>
                                  setCurrentPage(Number(page))
                                }
                                className={`w-10 h-10 flex items-center justify-center rounded-xl text-sm font-bold transition-all ${
                                  currentPage === page
                                    ? "bg-indigo-600 text-white shadow-lg shadow-indigo-100 scale-105"
                                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                                }`}
                              >
                                {page}
                              </button>
                            )}
                          </React.Fragment>
                        ))}
                      </div>

                      <button
                        onClick={() =>
                          setCurrentPage((prev) =>
                            Math.min(
                              Math.ceil(
                                filteredCompanies.length / displayLimit,
                              ),
                              prev + 1,
                            ),
                          )
                        }
                        disabled={
                          currentPage ===
                          Math.ceil(filteredCompanies.length / displayLimit)
                        }
                        className="p-2 sm:p-2.5 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed rounded-xl transition-all text-slate-600 flex items-center justify-center"
                        title="Next Page"
                      >
                        <ChevronRight size={20} />
                      </button>
                    </div>

                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
                      Showing{" "}
                      {(currentPage - 1) * displayLimit + 1} -{" "}
                      {Math.min(
                        currentPage * displayLimit,
                        filteredCompanies.length,
                      )}{" "}
                      of {filteredCompanies.length} companies
                    </p>
                  </div>
                )}

                {filteredCompanies.length === 0 && (
                  <div className="text-center py-12">
                    <p className="text-gray-400">No companies found</p>
                  </div>
                )}
              </div>
            </>
          ) : (
            <RoleSearchSection
              roleSearchQuery={roleSearchQuery}
              setRoleSearchQuery={setRoleSearchQuery}
              currentRolePage={currentRolePage}
              setCurrentRolePage={setCurrentRolePage}
              displayLimit={displayLimit}
              setSelectedRole={setSelectedRole}
              getPaginationRange={getPaginationRange}
            />
          )}
        </div>
        <AnimatePresence>
          {selectedCompany && (
            <CompanyDetailModal
              company={selectedCompany}
              onClose={() => setSelectedCompany(null)}
            />
          )}
          {selectedRole && (
            <RoleDetailModal
              role={selectedRole}
              onClose={() => setSelectedRole(null)}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};

const CompanyCard: React.FC<{
  company: SponsorCompany;
  index: number;
  onClick: () => void;
}> = ({ company, index, onClick }) => {
  const isARating = company.typeRating.includes("A rating");

  return (
    <motion.button
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay: index * 0.01 }}
      onClick={onClick}
      className="group relative flex flex-col rounded-xl border bg-white border-slate-200 p-4 sm:p-5 shadow-sm transition-all duration-200 hover:shadow-lg hover:border-slate-300 select-none text-left"
    >
      <div className="flex-1 min-w-0 mb-4">
        <h4 className="text-[15px] font-bold text-slate-900 mb-1.5 group-hover:text-indigo-600 transition-colors truncate">
          {company.organisationName}
        </h4>

        {(company.townCity || company.county) && (
          <p className="text-xs font-medium text-slate-500 flex items-center gap-1.5">
            <MapPin size={12} className="text-slate-400" />
            <span className="truncate">
              {[company.townCity, company.county].filter(Boolean).join(", ")}
            </span>
          </p>
        )}
      </div>

      <div className="flex flex-wrap gap-2 pt-4 border-t border-slate-50">
        <span
          className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-md border ${
            isARating
              ? "bg-emerald-50 text-emerald-700 border-emerald-100"
              : "bg-indigo-50 text-indigo-700 border-indigo-100"
          }`}
        >
          {company.typeRating}
        </span>
        <span className="text-[10px] font-bold uppercase tracking-wider bg-blue-50 text-blue-700 px-2.5 py-1 rounded-md border border-blue-100">
          {company.route}
        </span>
      </div>
    </motion.button>
  );
};

const CompanyDetailModal: React.FC<{
  company: SponsorCompany;
  onClose: () => void;
}> = ({ company, onClose }) => {
  const isARating = company.typeRating.includes("A rating");
  const [companyDetails, setCompanyDetails] = useState<CompanyDetails | null>(
    null,
  );
  const [isLoadingDetails, setIsLoadingDetails] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchCompanyDetails();
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  const fetchCompanyDetails = async () => {
    try {
      setIsLoadingDetails(true);
      setError(null);

      const response = await fetch("/api/company-insights", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          organisationName: company.organisationName,
          townCity: company.townCity,
          county: company.county,
          typeRating: company.typeRating,
        }),
      });

      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }

      const data = (await response.json()) as CompanyDetails;
      setCompanyDetails(data);
    } catch (err) {
      console.error("Failed to fetch company details:", err);
      setError("Unable to load additional company details right now.");
      setCompanyDetails(null);
    } finally {
      setIsLoadingDetails(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="fixed top-0 left-0 right-0 bottom-0 z-9999 flex items-end sm:items-center justify-center sm:p-4 bg-black/50 scrollbar-hide"
      onClick={onClose}
      onKeyDown={(e) => e.key === "Escape" && onClose()}
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 100 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.95, opacity: 0, y: 100 }}
        transition={{ duration: 0.15 }}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
        className="bg-white w-full max-w-3xl h-[95vh] sm:h-auto sm:max-h-[90vh] overflow-y-auto scrollbar-hide rounded-t-2xl sm:rounded-lg border border-slate-200 shadow-xl relative"
      >
        <div className="sticky top-0 bg-white border-b border-slate-200 p-4 sm:p-6 flex items-start justify-between gap-3 z-10">
          <div className="flex-1 min-w-0 pr-2">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 mb-2">
              <h2 className="text-base sm:text-lg md:text-xl font-bold text-slate-900 wrap-break-word leading-tight">
                {company.organisationName}
              </h2>
              {isARating && (
                <span className="inline-block px-2 py-1 rounded text-[10px] sm:text-xs font-medium bg-emerald-50 text-emerald-700 w-fit">
                  A Rating
                </span>
              )}
            </div>
            {(company.townCity || company.county) && (
              <p className="text-xs sm:text-sm text-slate-500 flex items-center gap-1">
                <MapPin size={14} className="shrink-0" />
                <span className="truncate">
                  {[company.townCity, company.county].filter(Boolean).join(", ")}
                </span>
              </p>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 text-slate-400 hover:text-slate-900 transition-colors rounded shrink-0"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-4 sm:p-6 space-y-4 sm:space-y-6">
          <div>
            <h3 className="text-base sm:text-lg font-semibold text-slate-900 mb-3 sm:mb-4">
              Overview
            </h3>
            {isLoadingDetails ? (
              <div className="animate-pulse space-y-3">
                <div className="h-4 bg-slate-200 rounded w-3/4" />
                <div className="h-4 bg-slate-200 rounded w-1/2" />
              </div>
            ) : (
              <>
                <p className="text-sm text-slate-600">
                  {companyDetails?.description ||
                    "Licensed UK visa sponsor company"}
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                  <div className="bg-slate-100 p-3 rounded-lg border border-slate-200">
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">
                      Company Number
                    </p>
                    <p className="text-slate-900 font-mono text-sm font-semibold break-all">
                      {companyDetails?.registrationNumber || "N/A"}
                    </p>
                  </div>
                  <div className="bg-slate-100 p-3 rounded-lg border border-slate-200">
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">
                      Founded
                    </p>
                    <p className="text-slate-900 text-sm font-semibold">
                      {companyDetails?.foundedYear || "N/A"}
                    </p>
                  </div>
                  <div className="bg-slate-100 p-3 rounded-lg border border-slate-200">
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">
                      Size
                    </p>
                    <p className="text-slate-900 text-sm font-semibold">
                      {companyDetails?.employees || "N/A"}
                    </p>
                  </div>
                  <div className="bg-slate-100 p-3 rounded-lg border border-slate-200">
                    <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider mb-1">
                      Visa Route
                    </p>
                    <p className="text-slate-900 text-sm font-semibold">
                      {company.route}
                    </p>
                  </div>
                </div>

                {companyDetails?.website && (
                  <a
                    href={
                      companyDetails.website.startsWith("http")
                        ? companyDetails.website
                        : `https://${companyDetails.website}`
                    }
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-indigo-600 hover:text-indigo-700 text-sm font-medium"
                  >
                    Visit Website
                  </a>
                )}
              </>
            )}
          </div>

          {!isLoadingDetails && companyDetails?.applicationGuide && (
            <div>
              <h3 className="text-lg font-semibold text-slate-900 mb-4">
                How to Apply
              </h3>
              <div className="bg-slate-100 rounded-lg p-4 border border-slate-200">
                <p className="text-sm text-slate-600 whitespace-pre-wrap">
                  {companyDetails.applicationGuide}
                </p>
              </div>
            </div>
          )}

          {!isLoadingDetails && companyDetails?.visaSponsorshipInfo && (
            <div>
              <h3 className="text-lg font-semibold text-slate-900 mb-4">
                Visa Sponsorship
              </h3>
              <div className="bg-blue-100 rounded-lg p-4 border border-blue-200">
                <p className="text-sm text-slate-700 whitespace-pre-wrap">
                  {companyDetails.visaSponsorshipInfo}
                </p>
              </div>
            </div>
          )}

          {!isLoadingDetails && companyDetails?.keySkills && (
            <div>
              <h3 className="text-lg font-semibold text-slate-900 mb-4">
                Key Skills
              </h3>
              <div className="flex flex-wrap gap-2">
                {companyDetails.keySkills.map((skill, idx) => (
                  <span
                    key={idx}
                    className="px-3 py-1 rounded-full text-sm bg-slate-100 text-slate-600 border border-slate-200"
                  >
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          )}

          {!isLoadingDetails && companyDetails?.salaryBreakdown && (
            <div>
              <h3 className="text-lg font-semibold text-slate-900 mb-4">
                Salary Range (GBP)
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="bg-slate-100 rounded-xl p-4 border border-slate-200">
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1">
                    Entry Level
                  </p>
                  <p className="text-slate-900 font-bold">
                    {companyDetails.salaryBreakdown.entry}
                  </p>
                </div>
                <div className="bg-slate-100 rounded-xl p-4 border border-slate-200">
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1">
                    Mid Level
                  </p>
                  <p className="text-slate-900 font-bold">
                    {companyDetails.salaryBreakdown.mid}
                  </p>
                </div>
                <div className="bg-slate-100 rounded-xl p-4 border border-slate-200">
                  <p className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1">
                    Senior Level
                  </p>
                  <p className="text-slate-900 font-bold">
                    {companyDetails.salaryBreakdown.senior}
                  </p>
                </div>
              </div>
            </div>
          )}

          {!isLoadingDetails &&
            companyDetails?.activeRoles &&
            companyDetails.activeRoles.length > 0 && (
              <div>
                <h3 className="text-lg font-semibold text-slate-900 mb-4">
                  Active Hiring Roles
                </h3>
                <div className="space-y-2">
                  {companyDetails.activeRoles.map((role, idx) => (
                    <div
                      key={idx}
                      className="bg-slate-100 rounded-lg p-3 border border-slate-200"
                    >
                      <p className="text-sm font-medium text-slate-900">
                        {role.title}
                      </p>
                      <div className="flex gap-2 mt-2 flex-wrap">
                        <span className="text-xs px-2 py-1 rounded bg-white text-slate-500 border border-slate-200">
                          SOC {role.socCode}
                        </span>
                        <span className="text-xs px-2 py-1 rounded bg-blue-50 text-blue-700 border border-blue-100">
                          {role.level}
                        </span>
                        {role.sponsorshipEligible && (
                          <span className="text-xs px-2 py-1 rounded bg-emerald-50 text-emerald-700 border border-emerald-100">
                            Sponsorship Eligible
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

          {!isLoadingDetails && companyDetails?.interviewTips && (
            <div>
              <h3 className="text-lg font-semibold text-slate-900 mb-4">
                Interview Tips
              </h3>
              <div className="bg-slate-50 rounded-lg p-4 border border-slate-200">
                <p className="text-sm text-slate-600 whitespace-pre-wrap">
                  {companyDetails.interviewTips}
                </p>
              </div>
            </div>
          )}

          {isLoadingDetails && (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="animate-spin text-blue-400" size={24} />
              <span className="ml-3 text-gray-400">
                Researching company details...
              </span>
            </div>
          )}

          {error && (
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-4">
              <p className="text-sm text-red-300">{error}</p>
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
};

const RoleDetailModal: React.FC<{
  role: (typeof socCodes)[0];
  onClose: () => void;
}> = ({ role, onClose }) => {
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      className="fixed top-0 left-0 right-0 bottom-0 z-9999 flex items-end sm:items-center justify-center sm:p-4 bg-black/60 backdrop-blur-sm"
      onClick={onClose}
      onKeyDown={(e) => e.key === "Escape" && onClose()}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 100 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 100 }}
        transition={{ duration: 0.2 }}
        className="bg-white border border-slate-200 rounded-t-2xl sm:rounded-xl w-full max-w-3xl h-[95vh] sm:h-auto sm:max-h-[90vh] overflow-y-auto scrollbar-hide shadow-2xl"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 bg-white/95 backdrop-blur border-b border-slate-200 p-4 sm:p-6 flex justify-between items-start gap-3 z-10">
          <div className="flex-1 min-w-0 pr-2">
            <div className="flex items-start gap-2 sm:gap-3 mb-3">
              <div className="p-1.5 sm:p-2 bg-indigo-50 rounded-lg shrink-0">
                <Briefcase
                  size={20}
                  className="text-indigo-700 sm:w-6 sm:h-6"
                />
              </div>
              <div className="min-w-0">
                <h2 className="text-xl sm:text-2xl font-bold text-slate-900 mb-1 wrap-break-word">
                  {role.name}
                </h2>
                <span className="text-[10px] sm:text-sm font-mono text-slate-700 font-bold bg-slate-100 px-2 sm:px-2.5 py-1 rounded border border-slate-300 shadow-sm inline-block">
                  SOC {role.code}
                </span>
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-full transition-colors shrink-0 text-slate-400 hover:text-slate-700"
          >
            <X size={24} />
          </button>
        </div>

        <div className="p-4 sm:p-8 space-y-6 sm:space-y-8">
          <div className="flex flex-wrap gap-2">
            <span
              className={`text-xs sm:text-sm font-bold px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg border shadow-sm ${
                role.skilled_status === "Higher Skilled"
                  ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                  : role.skilled_status === "Ineligible"
                    ? "bg-rose-50 text-rose-800 border-rose-200"
                    : "bg-indigo-50 text-indigo-800 border-indigo-200"
              }`}
            >
              • {role.skilled_status}
            </span>
            {role.eligible_isl === "Yes" && (
              <span className="text-xs sm:text-sm font-bold bg-amber-50 text-amber-800 px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg border border-amber-200 shadow-sm">
                • Immigration Salary List
              </span>
            )}
            {role.eligible_phd === "Yes" && (
              <span className="text-xs sm:text-sm font-bold bg-purple-50 text-purple-800 px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg border border-purple-200 shadow-sm">
                • PhD Eligible
              </span>
            )}
          </div>

          {role.description && (
            <div>
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-3">
                Role Description
              </h3>
              <p className="text-base text-slate-700 leading-relaxed max-w-3xl">
                {role.description}
              </p>
            </div>
          )}

          {role.related_titles && (
            <div>
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider mb-3">
                Related Job Titles
              </h3>
              <p className="text-base text-slate-600 leading-relaxed">
                {role.related_titles}
              </p>
            </div>
          )}

          <div>
            <h3 className="text-base sm:text-lg font-bold text-slate-900 mb-3 sm:mb-4 flex items-center gap-2">
              Visa Sponsorship Criteria
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
              <div
                className={`rounded-xl p-5 border shadow-sm ${
                  role.skilled_status === "Higher Skilled"
                    ? "bg-white border-emerald-200 ring-1 ring-emerald-100"
                    : role.skilled_status === "Ineligible"
                      ? "bg-white border-rose-200 ring-1 ring-rose-100"
                      : "bg-white border-indigo-200"
                }`}
              >
                <p className="text-xs font-bold uppercase tracking-wide opacity-70 mb-2">
                  Skill Level
                </p>
                <div className="flex items-center gap-3 mb-2">
                  <div
                    className={`w-3 h-3 rounded-full ${
                      role.skilled_status === "Higher Skilled"
                        ? "bg-emerald-600"
                        : role.skilled_status === "Ineligible"
                          ? "bg-rose-600"
                          : "bg-indigo-600"
                    }`}
                  />
                  <p className="text-lg font-bold text-slate-900">
                    {role.skilled_status}
                  </p>
                </div>
                <p className="text-sm text-slate-600">
                  {role.skilled_status === "Higher Skilled"
                    ? "Eligible for Skilled Worker visa (RQF Level 6+)"
                    : role.skilled_status === "Ineligible"
                      ? "Not eligible for standard visa sponsorship"
                      : "May be eligible under specific conditions"}
                </p>
              </div>

              <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">
                  PhD Points
                </p>
                <div className="flex items-center gap-3 mb-2">
                  <div
                    className={`w-3 h-3 rounded-full ${
                      role.eligible_phd === "Yes"
                        ? "bg-purple-600"
                        : "bg-slate-300"
                    }`}
                  />
                  <p className="text-lg font-bold text-slate-900">
                    {role.eligible_phd === "Yes" ? "Eligible" : "Not Eligible"}
                  </p>
                </div>
                <p className="text-sm text-slate-600">
                  {role.eligible_phd === "Yes"
                    ? "Qualifies for tradeable points with relevant PhD"
                    : "Standard points system applies"}
                </p>
              </div>

              <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">
                  Salary List (ISL)
                </p>
                <div className="flex items-center gap-3 mb-2">
                  <div
                    className={`w-3 h-3 rounded-full ${
                      role.eligible_isl === "Yes"
                        ? "bg-amber-500"
                        : "bg-slate-300"
                    }`}
                  />
                  <p className="text-lg font-bold text-slate-900">
                    {role.eligible_isl === "Yes" ? "On the List" : "Not Listed"}
                  </p>
                </div>
                <p className="text-sm text-slate-600">
                  {role.eligible_isl === "Yes"
                    ? "Eligible for reduced salary threshold (70% of rate)"
                    : "Standard salary threshold applies"}
                </p>
              </div>

              <div className="bg-white rounded-xl p-5 border border-slate-200 shadow-sm">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">
                  Salary Scale
                </p>
                <div className="flex items-center gap-3 mb-2">
                  <div
                    className={`w-3 h-3 rounded-full ${
                      role.salary_scale === "Yes"
                        ? "bg-blue-600"
                        : "bg-slate-300"
                    }`}
                  />
                  <p className="text-lg font-bold text-slate-900">
                    {role.salary_scale === "Yes" ? "Standard Rate" : "Variable"}
                  </p>
                </div>
                <p className="text-sm text-slate-600">
                  {role.salary_scale === "Yes"
                    ? "Going rate must be met for sponsorship"
                    : "See specific government guidance"}
                </p>
              </div>
            </div>
          </div>

          <div className="bg-blue-50 border border-blue-100 rounded-xl p-5">
            <div className="flex items-start gap-4">
              <AlertTriangle
                size={22}
                className="text-blue-600 shrink-0 mt-0.5"
              />
              <div>
                <h4 className="text-base font-bold text-blue-900 mb-2">
                  Official Guidance Note
                </h4>
                <p className="text-sm text-slate-700 leading-relaxed">
                  This data is sourced from the UK Government&apos;s SOC 2020
                  classification system. Eligibility rules change frequently.
                  Always verify with official UK Visas and Immigration guidance
                  before submitting applications.
                </p>
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
};

const RoleSearchSection: React.FC<{
  roleSearchQuery: string;
  setRoleSearchQuery: (value: string) => void;
  currentRolePage: number;
  setCurrentRolePage: (value: number) => void;
  displayLimit: number;
  setSelectedRole: (role: (typeof socCodes)[0]) => void;
  getPaginationRange: (current: number, total: number) => (number | string)[];
}> = ({
  roleSearchQuery,
  setRoleSearchQuery,
  currentRolePage,
  setCurrentRolePage,
  displayLimit,
  setSelectedRole,
  getPaginationRange,
}) => {
  const filteredRoles = socCodes.filter((role) =>
    roleSearchQuery
      ? role.name.toLowerCase().includes(roleSearchQuery.toLowerCase()) ||
        role.code.includes(roleSearchQuery) ||
        (role.related_titles &&
          role.related_titles
            .toLowerCase()
            .includes(roleSearchQuery.toLowerCase()))
      : true,
  );

  const totalRolePages = Math.ceil(filteredRoles.length / displayLimit);

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-xl font-bold text-slate-900 mb-2">
          Check Job Sponsorship Eligibility
        </h2>
        <p className="text-slate-500">
          Search for a job title to see its SOC 2020 code and visa
          eligibility.
        </p>
      </div>

      <div className="mb-8 relative">
        <Search className="absolute left-3 top-3 text-slate-400" size={20} />
        <input
          type="text"
          value={roleSearchQuery}
          onChange={(e) => setRoleSearchQuery(e.target.value)}
          placeholder="Search job roles..."
          className="w-full bg-white border border-slate-200 text-slate-900 pl-10 pr-4 py-2 rounded-lg focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {filteredRoles
          .slice(
            (currentRolePage - 1) * displayLimit,
            currentRolePage * displayLimit,
          )
          .map((role) => (
            <button
              key={role.code}
              onClick={() => setSelectedRole(role)}
              className="group relative flex flex-col rounded-xl border bg-white border-slate-200 p-4 sm:p-5 shadow-sm transition-all duration-200 hover:shadow-lg hover:border-slate-300 select-none text-left"
            >
              <div className="flex-1 min-w-0 mb-4">
                <div className="flex items-start gap-3 mb-1.5">
                  <div className="p-1.5 bg-indigo-50 rounded-lg group-hover:bg-indigo-100 transition-colors">
                    <Briefcase size={16} className="text-indigo-600 shrink-0" />
                  </div>
                  <h4 className="text-[15px] font-bold text-slate-900 group-hover:text-indigo-600 transition-colors leading-tight">
                    {role.name}
                  </h4>
                </div>
                <p className="text-[11px] font-mono font-bold text-slate-700 ml-9 uppercase tracking-wider bg-slate-50/80 px-2 py-0.5 rounded inline-block">
                  SOC Code: {role.code}
                </p>
              </div>

              <div className="flex flex-wrap gap-2 pt-4 border-t border-slate-50">
                <span
                  className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-md border shadow-sm ${
                    role.skilled_status === "Higher Skilled"
                      ? "bg-emerald-50 text-emerald-800 border-emerald-100"
                      : role.skilled_status === "Ineligible"
                        ? "bg-rose-50 text-rose-800 border-rose-100"
                        : "bg-indigo-50 text-indigo-800 border-indigo-100"
                  }`}
                >
                  {role.skilled_status}
                </span>
                {role.eligible_isl === "Yes" && (
                  <span className="text-[10px] font-bold uppercase tracking-wider bg-amber-50 text-amber-800 px-2.5 py-1 rounded-md border border-amber-100 shadow-sm">
                    ISL
                  </span>
                )}
                {role.eligible_phd === "Yes" && (
                  <span className="text-[10px] font-bold uppercase tracking-wider bg-purple-50 text-purple-800 px-2.5 py-1 rounded-md border border-purple-100 shadow-sm">
                    PhD
                  </span>
                )}
              </div>
            </button>
          ))}
      </div>

      {filteredRoles.length > displayLimit && (
        <div className="mt-12 flex flex-col items-center justify-center gap-6">
          <div className="flex items-center gap-1 sm:gap-2 bg-white p-1.5 rounded-2xl border border-slate-200 shadow-sm">
            <button
              onClick={() =>
                setCurrentRolePage((prev) => Math.max(1, prev - 1))
              }
              disabled={currentRolePage === 1}
              className="p-2 sm:p-2.5 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed rounded-xl transition-all text-slate-600 flex items-center justify-center"
              title="Previous Page"
            >
              <ChevronLeft size={20} />
            </button>

            <div className="flex items-center gap-1">
              {getPaginationRange(currentRolePage, totalRolePages).map(
                (page: string | number, i: number) => (
                  <React.Fragment key={i}>
                    {page === "..." ? (
                      <span className="w-10 h-10 flex items-center justify-center text-slate-400 font-medium">
                        ...
                      </span>
                    ) : (
                      <button
                        onClick={() => setCurrentRolePage(Number(page))}
                        className={`w-10 h-10 flex items-center justify-center rounded-xl text-sm font-bold transition-all ${
                          currentRolePage === page
                            ? "bg-indigo-600 text-white shadow-lg shadow-indigo-100 scale-105"
                            : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                        }`}
                      >
                        {page}
                      </button>
                    )}
                  </React.Fragment>
                ),
              )}
            </div>

            <button
              onClick={() =>
                setCurrentRolePage((prev) => Math.min(totalRolePages, prev + 1))
              }
              disabled={currentRolePage === totalRolePages}
              className="p-2 sm:p-2.5 hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed rounded-xl transition-all text-slate-600 flex items-center justify-center"
              title="Next Page"
            >
              <ChevronRight size={20} />
            </button>
          </div>

          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">
            Showing {(currentRolePage - 1) * displayLimit + 1} -{" "}
            {Math.min(currentRolePage * displayLimit, filteredRoles.length)} of{" "}
            {filteredRoles.length} occupations
          </p>
        </div>
      )}
    </div>
  );
};

export default SponsorshipHub;

