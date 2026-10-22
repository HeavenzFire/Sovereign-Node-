/**
 * Minimal, side-effect-free capability manifest validator.
 * It validates metadata only; it does not execute commands or probe endpoints.
 */

const SUPPORTED_SCHEMA_VERSION = "1.0";
const CAPABILITY_ID = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/;

export function validateCapabilityRegistry(input) {
  const errors = [];
  if (!isRecord(input)) {
    return { valid: false, errors: ["registry must be an object"] };
  }

  if (input.schema_version !== SUPPORTED_SCHEMA_VERSION) {
    errors.push(`schema_version must equal "${SUPPORTED_SCHEMA_VERSION}"`);
  }

  if (!Array.isArray(input.capabilities)) {
    errors.push("capabilities must be an array");
    return { valid: false, errors };
  }

  const seen = new Set();
  input.capabilities.forEach((capability, index) => {
    const prefix = `capabilities[${index}]`;
    if (!isRecord(capability)) {
      errors.push(`${prefix} must be an object`);
      return;
    }

    for (const field of ["id", "name", "version"]) {
      if (typeof capability[field] !== "string" || capability[field].trim() === "") {
        errors.push(`${prefix}.${field} must be a non-empty string`);
      }
    }

    if (typeof capability.id === "string" && capability.id.trim() !== "") {
      if (!CAPABILITY_ID.test(capability.id)) {
        errors.push(`${prefix}.id must be lowercase and use letters, digits, dots, or hyphens`);
      }
      if (seen.has(capability.id)) {
        errors.push(`${prefix}.id duplicates "${capability.id}"`);
      }
      seen.add(capability.id);
    }

    const health = capability.health_check;
    if (!isRecord(health)) {
      errors.push(`${prefix}.health_check must be an object`);
    } else if (health.kind === "http") {
      if (typeof health.path !== "string" || !health.path.startsWith("/") || health.path.startsWith("//") || health.path.includes("\\") || /[\u0000-\u001F\u007F]/.test(health.path)) {
        errors.push(`${prefix}.health_check.path must be a local absolute path beginning with one slash`);
      }
      if (health.method !== undefined && !["GET", "HEAD"].includes(health.method)) {
        errors.push(`${prefix}.health_check.method must be GET or HEAD`);
      }
    } else if (health.kind === "manual") {
      if (typeof health.description !== "string" || health.description.trim() === "") {
        errors.push(`${prefix}.health_check.description is required for manual checks`);
      }
    } else {
      errors.push(`${prefix}.health_check.kind must be "http" or "manual"`);
    }
  });

  return { valid: errors.length === 0, errors };
}

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
