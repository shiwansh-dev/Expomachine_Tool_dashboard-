"use client";
import React from "react";
import Link from "next/link";
import { UserCircleIcon, PlugInIcon } from "@/icons";

export default function SettingsPage() {

  const settingsItems = [
    {
      id: "operators",
      name: "Operators",
      description: "Manage factory operators and their default machines",
      icon: <UserCircleIcon />,
      path: "/Factory-Genie/operators",
    },
    {
      id: "machines",
      name: "Machine Settings",
      description: "Configure machine parameters and thresholds",
      icon: <PlugInIcon />,
      path: "/Factory-Genie/machine-settings",
    },
  ];

  return (
    <div className="mx-auto max-w-screen-2xl p-4 md:p-6 2xl:p-10">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-title-md2 font-semibold text-black dark:text-white">
          Factory Genie Settings
        </h2>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {settingsItems.map((item) => (
          <Link
            key={item.id}
            href={item.path}
            className="group rounded-lg border border-stroke bg-white p-6 shadow-default transition-all duration-300 hover:shadow-lg dark:border-strokedark dark:bg-boxdark hover:scale-105"
          >
            <div className="mb-4 flex items-center justify-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-primary group-hover:bg-primary group-hover:text-white transition-all duration-300">
                {item.icon}
              </div>
            </div>
            <h3 className="mb-2 text-lg font-semibold text-gray-900 dark:text-white">
              {item.name}
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {item.description}
            </p>
          </Link>
        ))}
      </div>

      <div className="mt-8 rounded-lg border border-stroke bg-white p-6 shadow-default dark:border-strokedark dark:bg-boxdark">
        <h3 className="mb-4 text-lg font-semibold text-gray-900 dark:text-white">
          Quick Actions
        </h3>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Link
            href="/Factory-Genie/operators"
            className="flex items-center gap-3 rounded-lg border border-stroke p-4 hover:bg-gray-50 dark:border-strokedark dark:hover:bg-gray-800"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
              <UserCircleIcon />
            </div>
            <div>
              <h4 className="font-medium text-gray-900 dark:text-white">Manage Operators</h4>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Add, edit, or remove factory operators
              </p>
            </div>
          </Link>
          
          <Link
            href="/Factory-Genie/machine-settings"
            className="flex items-center gap-3 rounded-lg border border-stroke p-4 hover:bg-gray-50 dark:border-strokedark dark:hover:bg-gray-800"
          >
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
              <PlugInIcon />
            </div>
            <div>
              <h4 className="font-medium text-gray-900 dark:text-white">Machine Configuration</h4>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Configure machine settings and parameters
              </p>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
}
