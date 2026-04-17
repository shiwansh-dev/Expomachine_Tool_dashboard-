"use client";
import React, { useEffect, useState } from "react";
import { PlusIcon, PencilIcon, TrashBinIcon } from "@/icons";

interface Operator {
  _id?: string;
  name: string;
  defaultMachine?: string;
  shift?: string;
  createdAt?: string;
  updatedAt?: string;
}

interface Machine {
  _id: string;
  Name: string;
}

export default function OperatorsPage() {
  const [operators, setOperators] = useState<Operator[]>([]);
  const [machines, setMachines] = useState<Machine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [editingOperator, setEditingOperator] = useState<Operator | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    defaultMachine: "",
    shift: "",
  });

  // Fetch operators
  const fetchOperators = async () => {
    try {
      const user = localStorage.getItem("user");
      if (!user) {
        setError("User not found");
        return;
      }
      const userData = JSON.parse(user);
      const userId = userData._id;
      
      const response = await fetch(`/api/factory-genie/operators?userId=${userId}`);
      if (!response.ok) throw new Error("Failed to fetch operators");
      const data = await response.json();
      setOperators(data.data || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch operators");
    }
  };

  // Fetch machines from device settings
  const fetchMachines = async () => {
    try {
      const deviceNo = localStorage.getItem("deviceNo") || "25";
      const response = await fetch(`/api/device-settings/${deviceNo}`);
      if (!response.ok) throw new Error("Failed to fetch machines");
      const data = await response.json();
      
      const machineList: Machine[] = [];
      if (data.data && data.data[0]) {
        const settings = data.data[0];
        // Extract machine names from channels
        for (let i = 1; i <= 8; i++) {
          const channel = `ch${i}`;
          if (settings[channel] && settings[channel].Name) {
            machineList.push({
              _id: channel,
              Name: settings[channel].Name,
            });
          }
        }
      }
      setMachines(machineList);
    } catch (err) {
      console.error("Failed to fetch machines:", err);
    }
  };

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([fetchOperators(), fetchMachines()]);
      setLoading(false);
    };
    loadData();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const user = localStorage.getItem("user");
      if (!user) {
        setError("User not found");
        return;
      }
      const userData = JSON.parse(user);
      const userId = userData._id;
      
      const url = editingOperator 
        ? `/api/factory-genie/operators/${editingOperator._id}?userId=${userId}`
        : "/api/factory-genie/operators";
      
      const method = editingOperator ? "PUT" : "POST";
      
      const requestBody = {
        ...formData,
        userId
      };
      
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) throw new Error("Failed to save operator");
      
      await fetchOperators();
      handleCloseModal();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save operator");
    }
  };

  const handleEdit = (operator: Operator) => {
    setEditingOperator(operator);
    setFormData({
      name: operator.name,
      defaultMachine: operator.defaultMachine || "",
      shift: operator.shift || "",
    });
    setShowModal(true);
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this operator?")) return;
    
    try {
      const user = localStorage.getItem("user");
      if (!user) {
        setError("User not found");
        return;
      }
      const userData = JSON.parse(user);
      const userId = userData._id;
      
      const response = await fetch(`/api/factory-genie/operators/${id}?userId=${userId}`, {
        method: "DELETE",
      });
      
      if (!response.ok) throw new Error("Failed to delete operator");
      
      await fetchOperators();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete operator");
    }
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingOperator(null);
    setFormData({ name: "", defaultMachine: "", shift: "" });
    setError(null);
  };

  const handleAddNew = () => {
    setEditingOperator(null);
    setFormData({ name: "", defaultMachine: "", shift: "" });
    setShowModal(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-screen-2xl p-4 md:p-6 2xl:p-10">
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-title-md2 font-semibold text-black dark:text-white">
          Operators Management
        </h2>
        <button
          onClick={handleAddNew}
          className="inline-flex items-center justify-center gap-2.5 rounded-md bg-gray-900 px-4 py-2 text-center font-medium text-white hover:bg-gray-800"
        >
          <PlusIcon />
          Add Operator
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded border-l-4 border-red-500 bg-red-50 p-4 dark:bg-red-900/20">
          <p className="text-red-700 dark:text-red-300">{error}</p>
        </div>
      )}

      <div className="rounded-sm border border-stroke bg-white shadow-default dark:border-strokedark dark:bg-boxdark">
        <div className="border-b border-stroke px-6.5 py-4 dark:border-strokedark">
          <h3 className="font-medium text-black dark:text-white">
            Operators List
          </h3>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-stroke bg-gray-50 text-left text-gray-700 dark:border-strokedark dark:bg-gray-800 dark:text-gray-200">
                <th className="px-6.5 py-3 font-medium">Operator Name</th>
                <th className="px-6.5 py-3 font-medium">Default Machine</th>
                <th className="px-6.5 py-3 font-medium">Shift</th>
                <th className="px-6.5 py-3 font-medium">Created At</th>
                <th className="px-6.5 py-3 font-medium text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              {operators.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6.5 py-4 text-center text-gray-500 dark:text-gray-400">
                    No operators found. Click &quot;Add Operator&quot; to create one.
                  </td>
                </tr>
              ) : (
                operators.map((operator) => (
                  <tr
                    key={operator._id}
                    className="border-b border-stroke hover:bg-gray-50 dark:border-strokedark dark:hover:bg-gray-800"
                  >
                    <td className="px-6.5 py-4 font-medium text-black dark:text-white">
                      {operator.name}
                    </td>
                    <td className="px-6.5 py-4 text-gray-700 dark:text-gray-300">
                      {operator.defaultMachine || "-"}
                    </td>
                    <td className="px-6.5 py-4 text-gray-700 dark:text-gray-300">
                      {operator.shift || "-"}
                    </td>
                    <td className="px-6.5 py-4 text-gray-700 dark:text-gray-300">
                      {operator.createdAt 
                        ? new Date(operator.createdAt).toLocaleDateString()
                        : "-"
                      }
                    </td>
                    <td className="px-6.5 py-4">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => handleEdit(operator)}
                          className="inline-flex items-center justify-center rounded-md bg-gray-900 px-3 py-1.5 text-center text-sm font-medium text-white hover:bg-gray-800"
                        >
                          <PencilIcon />
                        </button>
                        <button
                          onClick={() => operator._id && handleDelete(operator._id)}
                          className="inline-flex items-center justify-center rounded-md bg-red-500 px-3 py-1.5 text-center text-sm font-medium text-white hover:bg-opacity-90"
                        >
                          <TrashBinIcon />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl dark:bg-gray-800">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                {editingOperator ? "Edit Operator" : "Add New Operator"}
              </h3>
              <button
                onClick={handleCloseModal}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Operator Name *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full rounded border border-stroke px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary dark:border-strokedark"
                  placeholder="Enter operator name"
                  required
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Default Machine
                </label>
                <select
                  value={formData.defaultMachine}
                  onChange={(e) => setFormData({ ...formData, defaultMachine: e.target.value })}
                  className="w-full rounded border border-stroke px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary dark:border-strokedark"
                >
                  <option value="">Select a machine (optional)</option>
                  {machines.map((machine) => (
                    <option key={machine._id} value={machine.Name}>
                      {machine.Name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-gray-700 dark:text-gray-300">
                  Shift
                </label>
                <select
                  value={formData.shift}
                  onChange={(e) => setFormData({ ...formData, shift: e.target.value })}
                  className="w-full rounded border border-stroke px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary dark:border-strokedark"
                >
                  <option value="">Select a shift (optional)</option>
                  <option value="morning">Morning</option>
                  <option value="night">Night</option>
                </select>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  className="flex-1 rounded bg-gray-900 px-4 py-2 text-white hover:bg-gray-800"
                >
                  {editingOperator ? "Update" : "Create"}
                </button>
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="flex-1 rounded border border-stroke px-4 py-2 text-gray-700 hover:bg-gray-50 dark:border-strokedark dark:text-gray-300"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
