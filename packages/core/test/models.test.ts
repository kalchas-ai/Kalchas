import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { useTempDb } from "./helpers.ts";

useTempDb();

test("every call goes to the model of its class: the calls that judge and write to the main one, the many that read and play their part to the light one", async () => {
  const { classOf, modelFor, setConfig, defaultConfig } = await import("../src/config.ts");
  for (const p of ["clarify", "pace", "world_skeleton", "world_opening", "direct_plan", "direct_settle", "moment", "milestone", "advise", "report_final_behind"]) assert.equal(classOf(p), "main", p);
  for (const p of ["search", "lookup_read", "world_people", "persona", "person", "body_run", "rule", "record", "record_motion", "project_title"]) assert.equal(classOf(p), "light", p);
  // a purpose nobody listed is main
  assert.equal(classOf("something_new"), "main");
  setConfig({ classModels: {} });
  assert.equal(modelFor("moment"), defaultConfig.defaultModel);
  setConfig({ classModels: { main: "m/main", light: "m/light" } });
  assert.equal(modelFor("direct_settle"), "m/main");
  assert.equal(modelFor("person"), "m/light");
  // a model asked for by name wins
  assert.equal(modelFor("person", "m/named"), "m/named");
  // a test may set one kind of call apart from its class
  setConfig({ purposeModels: { moment: "m/scene" } });
  assert.equal(modelFor("moment"), "m/scene");
  assert.equal(modelFor("direct_settle"), "m/main");
  setConfig({ classModels: {}, purposeModels: {} });
});

test("KALCHAS_MODEL_FOR sets a model for one kind of call, for a test", async () => {
  const { loadSettings } = await import("../src/settings.ts");
  const { config, setConfig } = await import("../src/config.ts");
  process.env.KALCHAS_MODEL_FOR = "moment=m/scene, direct_settle = m/settle ,bad";
  loadSettings();
  assert.deepEqual(config().purposeModels, { moment: "m/scene", direct_settle: "m/settle" });
  delete process.env.KALCHAS_MODEL_FOR;
  setConfig({ purposeModels: {} });
});

test("one model does all the work: it is the one saved, shown on the settings page, and cleared back to the built-in one; what an older file saved besides is dropped", async () => {
  const { saveSettings, settingsPath, loadSettings } = await import("../src/settings.ts");
  const { config, setConfig, defaultConfig, modelFor, effortFor } = await import("../src/config.ts");
  const { settingsView } = await import("../src/views.ts");
  assert.equal(defaultConfig.defaultModel, "anthropic/claude-opus-5.5");
  assert.deepEqual(defaultConfig.classModels, {});
  setConfig({ classModels: {}, classEfforts: { ...defaultConfig.classEfforts } });
  assert.deepEqual([modelFor("narrate_stop"), modelFor("narrate_compress"), modelFor("clarify")], [defaultConfig.defaultModel, defaultConfig.defaultModel, defaultConfig.defaultModel]);
  // what an older file holds besides the model (a model per class, limits, a language) is not read, and goes when saved
  saveSettings({ defaultModel: "m/all", roleModels: { light: "m/light" }, budgetUsd: 12, language: "fr" } as never);
  assert.deepEqual([modelFor("narrate_stop"), modelFor("narrate_compress"), effortFor("narrate_stop")], ["m/all", "m/all", "high"]);
  assert.deepEqual(JSON.parse(readFileSync(settingsPath(), "utf8")), { defaultModel: "m/all" });
  assert.deepEqual(settingsView().defaultModel, "m/all");
  // for a run: one class on a model of its own, over what is saved
  process.env.KALCHAS_MODEL_MAIN = "m/run";
  try {
    loadSettings();
    assert.deepEqual([modelFor("narrate_stop"), modelFor("narrate_compress")], ["m/run", "m/all"]);
  } finally {
    delete process.env.KALCHAS_MODEL_MAIN;
  }
  // cleared: back on the built-in one
  saveSettings({ defaultModel: "" });
  assert.deepEqual([config().defaultModel, config().classModels], [defaultConfig.defaultModel, {}]);
  assert.ok(existsSync(settingsPath()));
  setConfig({ classModels: {}, classEfforts: {} });
});

test("how long each class thinks is set per class, saved or for a test, and a class not set is left to its model", async () => {
  const { effortFor, setConfig, config } = await import("../src/config.ts");
  const { loadSettings } = await import("../src/settings.ts");
  setConfig({ classEfforts: {} });
  assert.equal(effortFor("direct_plan"), undefined);
  setConfig({ classEfforts: { main: "low" } });
  assert.equal(effortFor("direct_plan"), "low");
  assert.equal(effortFor("person"), undefined);
  process.env.KALCHAS_EFFORT_MAIN = "medium";
  process.env.KALCHAS_EFFORT_LIGHT = "sideways";
  setConfig({ classEfforts: {} });
  loadSettings();
  assert.deepEqual(config().classEfforts, { main: "medium" });
  delete process.env.KALCHAS_EFFORT_MAIN;
  delete process.env.KALCHAS_EFFORT_LIGHT;
  setConfig({ classEfforts: {} });
});
