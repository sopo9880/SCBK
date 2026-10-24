shader_type spatial;
render_mode cull_disabled, diffuse_burley, specular_schlick_ggx;

// Procedural architecture: no copyrighted textures or photographed facades.
// Mesh UVs specify real-world metres per window and storey.
uniform vec4 wall_color : source_color = vec4(0.68, 0.66, 0.63, 1.0);
uniform vec4 trim_color : source_color = vec4(0.40, 0.40, 0.43, 1.0);
uniform vec4 glass_color : source_color = vec4(0.18, 0.35, 0.46, 1.0);
uniform float night_factor : hint_range(0.0, 1.0) = 0.0;
uniform float damage_tint : hint_range(0.0, 1.0) = 0.0;

void fragment() {
	vec2 cell = fract(UV);
	float xpane = step(0.14, cell.x) * (1.0 - step(0.85, cell.x));
	float ypane = step(0.26, cell.y) * (1.0 - step(0.78, cell.y));
	float window_mask = xpane * ypane;
	float sill = (1.0 - step(0.24, cell.y)) * step(0.91, cell.y + 0.70);
	float mortar = (1.0 - step(0.026, fract(UV.y * 5.0)));
	float brick_row = step(0.50, fract(UV.x * 3.0 + floor(UV.y * 5.0) * 0.5));
	vec3 brick = mix(wall_color.rgb, trim_color.rgb, mortar * 0.22 + brick_row * 0.035);
	brick = mix(brick, trim_color.rgb, sill * 0.2);
	vec3 glass = glass_color.rgb * (0.85 + 0.14 * sin(UV.x * 12.7 + UV.y * 4.0));
	vec3 facade = mix(brick, glass, window_mask);
	facade = mix(facade, vec3(0.22, 0.23, 0.24), damage_tint * 0.4);
	ALBEDO = facade;
	ROUGHNESS = mix(0.86, 0.15, window_mask);
	METALLIC = window_mask * 0.1;
	float lit_room = step(0.28, fract(floor(UV.x) * 0.37 + floor(UV.y) * 0.71));
	EMISSION = window_mask * night_factor * lit_room * vec3(0.90, 0.69, 0.37) * 0.65;
}
